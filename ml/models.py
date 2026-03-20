"""Pydantic models for API request/response payloads."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class WindowFeatures(BaseModel):
    service_name: str
    window_start: datetime
    window_end: datetime
    error_rate: float = Field(..., ge=0.0, le=1.0)
    warn_rate: float = Field(..., ge=0.0, le=1.0)
    avg_latency_ms: float = Field(..., ge=0.0)
    p95_latency_ms: float = Field(..., ge=0.0)
    log_volume: int = Field(..., ge=0)


class ScoreRequest(BaseModel):
    features: WindowFeatures


class ScoreResponse(BaseModel):
    service_name: str
    window_start: datetime
    window_end: datetime
    score: float
    is_anomaly: bool
    threshold: float


class AnomalyRecord(BaseModel):
    id: str
    log_id: Optional[str]
    score: float
    detected_at: datetime
    summary: Optional[str]
    window_start: Optional[datetime]
    window_end: Optional[datetime]
    service_name: Optional[str]


class HealthResponse(BaseModel):
    status: str
    model_ready: bool
    windows_collected: int
    last_retrain: Optional[datetime]
    summarizer_enabled: bool
