"""
logwatch ML service — FastAPI entrypoint.

Routes
------
GET  /health     → liveness + model-ready status
GET  /anomalies  → last 50 detected anomalies
POST /score      → manually score a feature window (testing / integration)
"""

from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

import uvicorn
from fastapi import FastAPI, HTTPException, status

from db import create_pool, fetch_recent_anomalies
from detector import ANOMALY_THRESHOLD, AnomalyDetector
from models import AnomalyRecord, HealthResponse, ScoreRequest, ScoreResponse

# JSON-ish log format so log lines are machine-parseable in prod.
logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":"%(message)s"}',
)
logger = logging.getLogger(__name__)

# Module-level singleton; populated during lifespan startup.
_detector: AnomalyDetector | None = None


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    global _detector

    pool = await create_pool()
    _detector = AnomalyDetector(pool)

    task = asyncio.create_task(_detector.run(), name="detector-loop")
    logger.info("ML service started")

    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        await pool.close()
        logger.info("ML service stopped")


app = FastAPI(
    title="logwatch-ml",
    version="1.0.0",
    description="Sliding-window anomaly detection for logwatch.",
    lifespan=lifespan,
)


def _get_detector() -> AnomalyDetector:
    if _detector is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Detector not initialised yet",
        )
    return _detector


# ------------------------------------------------------------------ #
# Routes                                                               #
# ------------------------------------------------------------------ #


@app.get("/health", response_model=HealthResponse, tags=["ops"])
async def health() -> HealthResponse:
    d = _get_detector()
    return HealthResponse(
        status="ok",
        model_ready=d.model_ready,
        windows_collected=d.windows_collected,
        last_retrain=d.last_retrain,
    )


@app.get(
    "/anomalies",
    response_model=list[AnomalyRecord],
    tags=["anomalies"],
)
async def get_anomalies() -> list[AnomalyRecord]:
    d = _get_detector()
    rows = await fetch_recent_anomalies(d.pool, limit=50)
    return [AnomalyRecord(**r) for r in rows]


@app.post(
    "/score",
    response_model=ScoreResponse,
    tags=["anomalies"],
    summary="Score a manually supplied feature window",
)
async def score(req: ScoreRequest) -> ScoreResponse:
    d = _get_detector()
    f = req.features
    feature_vec = [
        f.error_rate,
        f.warn_rate,
        f.avg_latency_ms,
        f.p95_latency_ms,
        float(f.log_volume),
    ]
    raw_score = await d.score_window(feature_vec)
    return ScoreResponse(
        service_name=f.service_name,
        window_start=f.window_start,
        window_end=f.window_end,
        score=raw_score,
        is_anomaly=raw_score < ANOMALY_THRESHOLD,
        threshold=ANOMALY_THRESHOLD,
    )


if __name__ == "__main__":
    port = int(os.getenv("ML_PORT", "8000"))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        log_level="info",
        access_log=True,
    )
