"""
Sliding-window anomaly detector.

Every SLIDE_SECONDS the detector queries the last WINDOW_SECONDS of logs
for each known service, builds a 5-dimensional feature vector, and scores
it with a trained IsolationForest.

Lifecycle
---------
1. Warm-up: accumulate WARMUP_WINDOWS vectors before the first fit.
2. Inference: score every new window; write anomalies whose score < ANOMALY_THRESHOLD.
3. Periodic retraining: every RETRAIN_INTERVAL_SECONDS, refit on all accumulated
   data so the model adapts to baseline drift.
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import asyncpg
import numpy as np
from sklearn.ensemble import IsolationForest

import summarizer

logger = logging.getLogger(__name__)

# --- configuration (all overridable via env) ---
WINDOW_SECONDS = int(os.getenv("WINDOW_SECONDS", "60"))
SLIDE_SECONDS = int(os.getenv("SLIDE_SECONDS", "10"))
ANOMALY_THRESHOLD = float(os.getenv("ANOMALY_THRESHOLD", "-0.1"))
WARMUP_WINDOWS = int(os.getenv("WARMUP_WINDOWS", "50"))
RETRAIN_INTERVAL_SECONDS = int(os.getenv("RETRAIN_INTERVAL_SECONDS", "1800"))

# Must match the service names emitted by the ingestion module.
SERVICES = ["auth-service", "payment-service", "api-gateway"]


class AnomalyDetector:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool
        self._model: Optional[IsolationForest] = None
        self._training_data: list[list[float]] = []
        self._model_ready = False
        self._last_retrain: Optional[datetime] = None
        self._windows_collected = 0
        # Protects _training_data and _model during concurrent access.
        self._lock = asyncio.Lock()

    # ------------------------------------------------------------------ #
    # Public read-only properties (consumed by /health and /anomalies)    #
    # ------------------------------------------------------------------ #

    @property
    def pool(self) -> asyncpg.Pool:
        return self._pool

    @property
    def model_ready(self) -> bool:
        return self._model_ready

    @property
    def windows_collected(self) -> int:
        return self._windows_collected

    @property
    def last_retrain(self) -> Optional[datetime]:
        return self._last_retrain

    # ------------------------------------------------------------------ #
    # Feature extraction                                                   #
    # ------------------------------------------------------------------ #

    async def _fetch_window_features(
        self, service: str, window_end: datetime
    ) -> Optional[list[float]]:
        """
        Query Postgres for aggregate statistics over the window
        [window_end - WINDOW_SECONDS, window_end).

        Returns a 5-element list or None if the window contains no logs.
        """
        window_start = window_end - timedelta(seconds=WINDOW_SECONDS)

        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    COUNT(*)::bigint                                          AS total,
                    COUNT(*) FILTER (WHERE severity = 'ERROR')::bigint       AS error_count,
                    COUNT(*) FILTER (WHERE severity = 'WARN')::bigint        AS warn_count,
                    AVG((raw_json->>'latency_ms')::float)
                        FILTER (WHERE raw_json ? 'latency_ms')               AS avg_latency,
                    (
                        SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (
                                   ORDER BY (raw_json->>'latency_ms')::float
                               )
                        FROM   logs
                        WHERE  service_name = $1
                          AND  timestamp    >= $2
                          AND  timestamp    <  $3
                          AND  raw_json     ?  'latency_ms'
                    )                                                         AS p95_latency
                FROM  logs
                WHERE service_name = $1
                  AND timestamp    >= $2
                  AND timestamp    <  $3
                """,
                service,
                window_start,
                window_end,
            )

        if row is None or row["total"] == 0:
            return None

        total = row["total"]
        return [
            row["error_count"] / total,        # error_rate
            row["warn_count"] / total,          # warn_rate
            float(row["avg_latency"] or 0.0),   # avg_latency_ms
            float(row["p95_latency"] or 0.0),   # p95_latency_ms
            float(total),                       # log_volume
        ]

    # ------------------------------------------------------------------ #
    # Model training                                                       #
    # ------------------------------------------------------------------ #

    async def _train(self) -> None:
        """Fit (or refit) the IsolationForest on all accumulated windows."""
        async with self._lock:
            snapshot = list(self._training_data)

        if len(snapshot) < WARMUP_WINDOWS:
            return

        X = np.array(snapshot, dtype=float)

        # IsolationForest.fit is CPU-bound; run in thread pool to avoid
        # blocking the event loop.
        loop = asyncio.get_running_loop()

        def _fit() -> IsolationForest:
            m = IsolationForest(
                n_estimators=100,
                contamination="auto",
                random_state=42,
                n_jobs=-1,
            )
            m.fit(X)
            return m

        model = await loop.run_in_executor(None, _fit)

        async with self._lock:
            self._model = model
            self._model_ready = True
            self._last_retrain = datetime.now(timezone.utc)

        logger.info(
            "IsolationForest trained",
            extra={"n_samples": len(snapshot), "n_features": 5},
        )

    # ------------------------------------------------------------------ #
    # Scoring                                                              #
    # ------------------------------------------------------------------ #

    def score_features(self, features: list[float]) -> float:
        """
        Return the raw anomaly score for a feature vector.
        Lower (more negative) means more anomalous.
        Returns 0.0 if the model is not yet ready.
        """
        if self._model is None:
            return 0.0
        X = np.array([features], dtype=float)
        return float(self._model.score_samples(X)[0])

    async def score_window(self, features: list[float]) -> float:
        """Thin async wrapper used by the POST /score endpoint."""
        return self.score_features(features)

    # ------------------------------------------------------------------ #
    # Anomaly persistence                                                  #
    # ------------------------------------------------------------------ #

    async def _write_anomaly(
        self,
        service: str,
        score: float,
        window_start: datetime,
        window_end: datetime,
        features: list[float],
    ) -> str:
        """Insert anomaly row and return its UUID string."""
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO anomalies
                    (score, detected_at, summary, window_start, window_end, service_name)
                VALUES ($1, NOW(), NULL, $2, $3, $4)
                RETURNING id::text
                """,
                score,
                window_start,
                window_end,
                service,
            )
        anomaly_id: str = row["id"]
        logger.warning(
            "Anomaly flagged",
            extra={
                "service": service,
                "score": score,
                "anomaly_id": anomaly_id,
                "window_start": window_start.isoformat(),
                "window_end": window_end.isoformat(),
            },
        )
        return anomaly_id

    # ------------------------------------------------------------------ #
    # Main loop                                                            #
    # ------------------------------------------------------------------ #

    async def run(self) -> None:
        """
        Background task: slide a detection window over every service on
        each SLIDE_SECONDS tick. Runs until cancelled.
        """
        logger.info(
            "Sliding-window detector started",
            extra={"window_s": WINDOW_SECONDS, "slide_s": SLIDE_SECONDS},
        )
        last_retrain_at = datetime.now(timezone.utc)

        while True:
            await asyncio.sleep(SLIDE_SECONDS)
            now = datetime.now(timezone.utc)

            for service in SERVICES:
                try:
                    features = await self._fetch_window_features(service, now)
                    if features is None:
                        continue

                    async with self._lock:
                        self._training_data.append(features)
                        self._windows_collected += 1

                    if not self._model_ready:
                        await self._train()
                    elif (
                        now - last_retrain_at
                    ).total_seconds() >= RETRAIN_INTERVAL_SECONDS:
                        await self._train()
                        last_retrain_at = now

                    if self._model_ready:
                        score = self.score_features(features)
                        if score < ANOMALY_THRESHOLD:
                            window_start = now - timedelta(seconds=WINDOW_SECONDS)
                            anomaly_id = await self._write_anomaly(
                                service, score, window_start, now, features
                            )
                            asyncio.create_task(
                                summarizer.summarize(
                                    self._pool,
                                    anomaly_id,
                                    service,
                                    window_start,
                                    now,
                                    score,
                                    features,
                                ),
                                name=f"summarize-{anomaly_id[:8]}",
                            )

                except asyncio.CancelledError:
                    raise
                except Exception:
                    logger.exception(
                        "Error during window scoring", extra={"service": service}
                    )
