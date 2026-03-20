# Logwatch — Architecture

## Overview

Logwatch is a production-quality AI-powered log anomaly detector designed as a
portfolio project demonstrating distributed systems, stream processing, and
applied machine learning.

```
┌──────────────────────────────────────────────────────────────────────┐
│                         logwatch system                              │
│                                                                      │
│  ┌───────────────┐   in-process    ┌───────────────────────────────┐ │
│  │   ingestion   │  ChannelBus /   │          consumer             │ │
│  │               │  Kinesis (ph2)  │                               │ │
│  │  producer.go  │ ─────────────▶  │  batch/writer.go              │ │
│  │  3 services   │                 │  batch=50, flush=2s           │ │
│  │  +anomalies   │                 │  exponential backoff          │ │
│  └───────────────┘                 └──────────────┬────────────────┘ │
│                                                   │                  │
│                                          pgx/v5 bulk INSERT          │
│                                                   │                  │
│                                   ┌───────────────▼──────────────┐  │
│                                   │        PostgreSQL 15          │  │
│                                   │  logs table (uuid, jsonb)    │  │
│                                   │  anomalies table (FK, score) │  │
│                                   └───────────────────────────────┘  │
│                                                                      │
│  ┌───────────────┐   HTTP/REST     ┌───────────────────────────────┐ │
│  │  ml/ (ph2)    │ ◀────────────── │   frontend/ (ph3)             │ │
│  │  FastAPI      │                 │   React + Express             │ │
│  │  IsolForest   │                 │   dashboard + charts          │ │
│  └───────────────┘                 └───────────────────────────────┘ │
│                                                                      │
│  ┌───────────────┐                                                   │
│  │  Redis 7      │  (reserved — rate limiting, pub/sub in ph2)      │
│  └───────────────┘                                                   │
└──────────────────────────────────────────────────────────────────────┘
```

## Components

### ingestion (Go)

- **module**: `github.com/yuyoungKim/logwatch/ingestion`
- Simulates three microservices: `auth-service`, `payment-service`, `api-gateway`
- Generates realistic log events at a configurable rate (default: 10/s)
- Injects synthetic anomalies: burst errors, high-latency requests, panics
- Uses Go's `log/slog` with a JSON handler — every log line is structured
- Publishes via the `stream.Publisher` interface; the default implementation
  is `ChannelBus` (in-process). Swapping to Kinesis requires only a new
  implementation of `Publisher` — no changes to `producer.go`.

### consumer (Go)

- **module**: `github.com/yuyoungKim/logwatch/consumer`
- Reads from `stream.Subscriber`, validates each event, and accumulates them
  in a buffer.
- Flushes to PostgreSQL in batches of 50 or every 2 seconds (configurable).
- Uses `pgx/v5` with `pgxpool` for efficient connection management.
- Bulk INSERT uses PostgreSQL's `unnest()` for a single round-trip per batch.
- Retries DB connection on startup with exponential backoff (max 10 attempts).
- Handles SIGINT/SIGTERM: drains the buffer before exiting.

### infra

- `docker-compose.yml`: PostgreSQL 15 + Redis 7 with health checks and
  persistent named volumes.
- `migrations/001_init.sql`: idempotent schema (`IF NOT EXISTS`). Runs
  automatically on first container start via `docker-entrypoint-initdb.d`.

### ml/ (Phase 2)

FastAPI service exposing a `/score` endpoint. Receives a log batch, runs
`IsolationForest`, and returns anomaly scores. Detected anomalies are written
to the `anomalies` table.

### frontend/ (Phase 3)

React SPA backed by a small Express API. Displays a real-time log stream,
anomaly score timeline, and per-service error rates.

## Data Model

```sql
logs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp    TIMESTAMPTZ NOT NULL,
    severity     log_severity NOT NULL,   -- ENUM: DEBUG/INFO/WARN/ERROR
    service_name TEXT NOT NULL,
    message      TEXT NOT NULL,
    request_id   TEXT,
    raw_json     JSONB NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

anomalies (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    log_id       UUID NOT NULL REFERENCES logs(id) ON DELETE CASCADE,
    score        DOUBLE PRECISION NOT NULL,
    detected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    summary      TEXT
)
```

Indexes: `logs(timestamp DESC)`, `logs(severity)`, `logs(service_name)`,
`anomalies(log_id)`, `anomalies(score DESC)`.

## Key Design Decisions

| Decision | Rationale |
|---|---|
| `stream.Publisher` interface | Decouples producer from transport; Kinesis swaps in without changing business logic |
| `pgx/v5 unnest()` bulk insert | Single SQL round-trip per batch vs. N individual INSERTs |
| Exponential backoff on DB connect | Consumer starts before DB is ready in Docker; avoids crash loops |
| `IF NOT EXISTS` migrations | Safe to re-run migrations; no manual state tracking needed |
| JSONB `raw_json` column | Preserves full original payload for future feature extraction |
| Separate Go modules per service | Each service has its own dependency graph; cleaner for mono-repo |

## Environment Variables

See [`.env.example`](.env.example) for a full reference with descriptions.

## Phases

- [x] Phase 1: Go producer + consumer + PostgreSQL + Redis infra
- [ ] Phase 2: Python anomaly detection service (IsolationForest, FastAPI)
- [ ] Phase 3: React dashboard (real-time log stream, anomaly timeline)
- [ ] Phase 4: LLM root-cause summarizer (Claude API)
