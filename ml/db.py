"""asyncpg connection pool and query helpers."""

from __future__ import annotations

import os
from typing import Any

import asyncpg


async def create_pool() -> asyncpg.Pool:
    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        raise RuntimeError("DATABASE_URL environment variable is not set")

    pool: asyncpg.Pool = await asyncpg.create_pool(
        dsn=dsn,
        min_size=2,
        max_size=10,
        command_timeout=30,
    )
    return pool


async def fetch_recent_anomalies(
    pool: asyncpg.Pool, limit: int = 50
) -> list[dict[str, Any]]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                id::text,
                log_id::text,
                score,
                detected_at,
                summary,
                window_start,
                window_end,
                service_name
            FROM  anomalies
            ORDER BY detected_at DESC
            LIMIT $1
            """,
            limit,
        )
    return [dict(r) for r in rows]
