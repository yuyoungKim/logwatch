"""
Claude-powered root cause summarizer (Phase 4).

Called after each anomaly is written to the DB.  Fetches the raw logs
from the anomaly window, builds a prompt, calls the Claude API, and
stores the plain-English summary back in anomalies.summary.

Usage
-----
1. Call ``init(api_key)`` once at startup.
2. After writing each anomaly row, fire-and-forget ``summarize(...)``
   via ``asyncio.create_task``.
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime
from typing import Optional

import asyncpg
import anthropic

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a senior SRE analyzing log anomalies. "
    "Given a window of logs from a microservice, write a 2-3 sentence "
    "plain-English root cause summary. Be specific: name the error types, "
    "affected endpoints, and likely cause. Be concise."
)

# Module-level state — set by init().
_client: Optional[anthropic.AsyncAnthropic] = None
_enabled: bool = False
_max_calls: int = 0   # 0 = unlimited
_call_count: int = 0


def init(api_key: str) -> None:
    """
    Initialise the Anthropic client.  Call once during app startup.

    Sets the module-level ``_enabled`` flag; all other functions check
    it so callers never need to guard against ``init`` not being called.
    """
    global _client, _enabled

    if os.getenv("SUMMARIZER_ENABLED", "true").lower() != "true":
        logger.info("Summarizer disabled via SUMMARIZER_ENABLED env var")
        return

    if not api_key:
        logger.warning("ANTHROPIC_API_KEY not set — summarizer disabled")
        return

    global _max_calls
    _client = anthropic.AsyncAnthropic(api_key=api_key)
    _enabled = True
    _max_calls = int(os.getenv("SUMMARIZER_MAX_CALLS", "0"))
    logger.info(
        "Summarizer initialised (claude-sonnet-4-20250514)",
        extra={"max_calls": _max_calls if _max_calls > 0 else "unlimited"},
    )


def is_enabled() -> bool:
    return _enabled


async def summarize(
    pool: asyncpg.Pool,
    anomaly_id: str,
    service: str,
    window_start: datetime,
    window_end: datetime,
    score: float,
    features: list[float],
) -> None:
    """
    Fetch logs → build prompt → call Claude → update anomalies.summary.

    Designed to be run as a fire-and-forget task via
    ``asyncio.create_task``.  Never raises — errors are logged and
    swallowed so the detector loop is never blocked or crashed.
    """
    global _call_count

    if not _enabled or _client is None:
        return

    if _max_calls > 0 and _call_count >= _max_calls:
        logger.debug("SUMMARIZER_MAX_CALLS reached — skipping", extra={"limit": _max_calls})
        return

    _call_count += 1

    try:
        await _run(pool, anomaly_id, service, window_start, window_end, score, features)
        logger.info(
            "Summary stored",
            extra={"anomaly_id": anomaly_id, "service": service},
        )
    except Exception:
        logger.exception(
            "Summary generation failed — leaving summary null",
            extra={"anomaly_id": anomaly_id},
        )


# ------------------------------------------------------------------ #
# Internal helpers                                                     #
# ------------------------------------------------------------------ #


async def _run(
    pool: asyncpg.Pool,
    anomaly_id: str,
    service: str,
    window_start: datetime,
    window_end: datetime,
    score: float,
    features: list[float],
) -> None:
    rows = await _fetch_logs(pool, service, window_start, window_end)
    prompt = _build_prompt(service, window_start, window_end, score, features, rows)
    summary = await _call_claude(prompt)

    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE anomalies SET summary = $1 WHERE id = $2::uuid",
            summary,
            anomaly_id,
        )


async def _fetch_logs(
    pool: asyncpg.Pool,
    service: str,
    window_start: datetime,
    window_end: datetime,
) -> list[asyncpg.Record]:
    async with pool.acquire() as conn:
        return await conn.fetch(
            """
            SELECT message, severity, service_name,
                   raw_json::text AS raw_json
            FROM   logs
            WHERE  service_name = $1
              AND  timestamp BETWEEN $2 AND $3
            ORDER  BY timestamp
            LIMIT  50
            """,
            service,
            window_start,
            window_end,
        )


def _build_prompt(
    service: str,
    window_start: datetime,
    window_end: datetime,
    score: float,
    features: list[float],
    rows: list[asyncpg.Record],
) -> str:
    error_rate, warn_rate, avg_lat, p95_lat, volume = features

    # Top 10 most severe logs — ERROR first, WARN second, then the rest.
    severity_order = {"ERROR": 0, "WARN": 1, "INFO": 2, "DEBUG": 3}
    top_logs = sorted(rows, key=lambda r: severity_order.get(r["severity"], 99))[:10]

    log_lines: list[str] = []
    for r in top_logs:
        line = f"[{r['severity']}] {r['message']}"
        if r["raw_json"] and r["raw_json"] not in ("null", ""):
            line += f" | {r['raw_json']}"
        log_lines.append(line)

    logs_block = "\n".join(log_lines) if log_lines else "(no logs in window)"

    prompt = (
        f"Service: {service}\n"
        f"Window: {window_start.isoformat()} → {window_end.isoformat()}\n"
        f"Anomaly score: {score:.4f}  (threshold -0.1; lower = more anomalous)\n\n"
        f"Feature summary:\n"
        f"  error_rate:     {error_rate:.1%}\n"
        f"  warn_rate:      {warn_rate:.1%}\n"
        f"  avg_latency_ms: {avg_lat:.1f} ms\n"
        f"  p95_latency_ms: {p95_lat:.1f} ms\n"
        f"  log_volume:     {int(volume)}\n\n"
        f"Top 10 most severe logs from this window:\n"
        f"{logs_block}\n"
    )

    # Keep well under 2 000 tokens (~6 000 chars ≈ 1 500 tokens).
    if len(prompt) > 6000:
        prompt = prompt[:6000] + "\n…(truncated)"

    return prompt


async def _call_claude(prompt: str) -> str:
    """
    Call the Claude API with one retry on transient 429 / 529 errors.
    Raises on the second failure so the caller can log and swallow it.
    """
    assert _client is not None  # guarded by _enabled check in summarize()

    for attempt in range(2):
        try:
            msg = await _client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=300,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
            )
            return msg.content[0].text

        except anthropic.RateLimitError:
            if attempt == 0:
                logger.warning("Claude API rate-limited (429) — retrying once")
                await asyncio.sleep(2)
                continue
            raise

        except anthropic.APIStatusError as exc:
            if exc.status_code == 529 and attempt == 0:
                logger.warning("Claude API overloaded (529) — retrying once")
                await asyncio.sleep(2)
                continue
            raise

    # Unreachable, but satisfies type checker.
    raise RuntimeError("_call_claude: exhausted retries")
