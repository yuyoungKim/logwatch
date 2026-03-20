# Logwatch — Architecture

## Overview

Logwatch is a production-quality AI-powered log anomaly detector designed as a
portfolio project demonstrating distributed systems, stream processing, and
applied machine learning.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            logwatch system                              │
│                                                                         │
│  ┌──────────────┐  in-process   ┌──────────────────────────────────┐   │
│  │  ingestion   │  ChannelBus   │           consumer               │   │
│  │              │ ────────────▶ │                                  │   │
│  │  producer.go │               │  batch/writer.go                 │   │
│  │  3 services  │               │  batch=50, flush=2s              │   │
│  │  +anomalies  │               │  exponential backoff             │   │
│  └──────────────┘               └──────────────┬───────────────────┘   │
│                                                │                        │
│                                       pgx/v5 unnest INSERT              │
│                                                │                        │
│                                ┌───────────────▼──────────────────┐    │
│                                │          PostgreSQL 15            │    │
│                                │  logs (uuid, jsonb, severity)    │    │
│                                │  anomalies (score, window, svc)  │    │
│                                └──────┬──────────────┬────────────┘    │
│                                       │              │                  │
│                              asyncpg  │         pg (node)               │
│                                       │              │                  │
│  ┌──────────────┐            ┌────────▼──────┐  ┌───▼──────────────┐   │
│  │   Redis 7    │            │  ml/ FastAPI  │  │ frontend/server  │   │
│  │  (reserved)  │            │  IsolForest   │  │ Express REST+SSE │   │
│  └──────────────┘            │  sliding win  │  └───────┬──────────┘   │
│                              └───────────────┘          │              │
│                                                   nginx proxy          │
│                                              ┌────────────────────┐    │
│                                              │  frontend/client   │    │
│                                              │  React + Vite      │    │
│                                              │  Live logs         │    │
│                                              │  Anomaly timeline  │    │
│                                              │  Alert cards       │    │
│                                              └────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

## Components

### ingestion (Go)

- **module**: `github.com/yuyoungKim/logwatch/ingestion`
- Simulates three microservices: `auth-service`, `payment-service`, `api-gateway`
- Generates realistic log events at a configurable rate (default: 10/s)
- Injects synthetic anomalies: burst errors, high-latency requests, panics
- Uses Go's `log/slog` with a JSON handler — every log line is structured
- Publishes via the `stream.Publisher` interface; default implementation is
  `ChannelBus` (in-process). Swapping to Kinesis requires only a new
  `Publisher` implementation — no changes to `producer.go`.

### consumer (Go)

- **module**: `github.com/yuyoungKim/logwatch/consumer`
- Reads from `stream.Subscriber`, validates each event, and accumulates in a buffer
- Flushes to PostgreSQL in batches of 50 or every 2 seconds (configurable)
- Uses `pgx/v5` with `pgxpool` for efficient connection management
- Bulk INSERT uses PostgreSQL's `unnest()` — single SQL round-trip per batch
- Retries DB connection on startup with exponential backoff (max 10 attempts)
- Handles SIGINT/SIGTERM: drains the buffer before exiting

### ml/ (Python — Phase 2)

- **framework**: FastAPI + asyncpg + scikit-learn
- Runs a background loop: every `SLIDE_SECONDS` (default 10s), queries the last
  `WINDOW_SECONDS` (default 60s) of logs for each service
- Extracts a 5-dimensional feature vector per window:
  `error_rate`, `warn_rate`, `avg_latency_ms`, `p95_latency_ms`, `log_volume`
- Scores windows with an `IsolationForest` (100 estimators, contamination=auto)
- Model fit runs in a thread pool to avoid blocking the event loop
- Retrains every `RETRAIN_INTERVAL_SECONDS` (default 30 min) to adapt to drift
- Writes flagged windows to the `anomalies` table
- Endpoints: `GET /health`, `GET /anomalies`, `POST /score`

### frontend/server (Node.js — Phase 3)

- **framework**: Express + pg
- Connects directly to PostgreSQL (same instance as the consumer)
- Endpoints:
  - `GET /api/logs?limit&service&severity` — paginated log query
  - `GET /api/anomalies?limit&service` — recent anomalies
  - `GET /api/stats` — severity counts, anomaly count/h, active services
  - `GET /api/stream` — SSE endpoint; polls DB every 3s and pushes `log` and
    `anomaly` events to connected clients

### frontend/client (React — Phase 3)

- **stack**: React 18, Vite, TypeScript (strict), recharts
- Three views:
  - **Live Logs** — scrolling table with severity badges (DEBUG=gray, INFO=blue,
    WARN=amber, ERROR=red), service/severity filters, pause toggle
  - **Anomaly Timeline** — recharts `LineChart` with one line per service
    (auth=purple, payment=teal, gateway=coral), click-to-inspect window detail
  - **Alert Cards** — WARNING (score > -0.2) / CRITICAL (score < -0.2) cards
    with score, time window, log volume, and LLM summary placeholder
- Real-time updates via a single `EventSource` connection to `/api/stream`
- nginx proxies `/api/` to the Express server (SSE-safe: buffering off,
  `proxy_read_timeout 3600s`)

### infra

- `docker-compose.yml`: 5 services — PostgreSQL 15, Redis 7, ml, frontend-server,
  frontend-client — all with health checks and startup ordering
- `migrations/001_init.sql`: idempotent schema (`IF NOT EXISTS`). Runs
  automatically on first container start via `docker-entrypoint-initdb.d`
- `migrations/002_anomaly_window.sql`: adds `window_start`, `window_end`,
  `service_name` to `anomalies`; makes `log_id` nullable for window-level records

## Data Model

```sql
-- Severity enum
CREATE TYPE log_severity AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR');

logs (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp    TIMESTAMPTZ NOT NULL,
    severity     log_severity NOT NULL,
    service_name TEXT        NOT NULL,
    message      TEXT        NOT NULL,
    request_id   TEXT,
    raw_json     JSONB       NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

anomalies (
    id           UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    log_id       UUID             REFERENCES logs(id) ON DELETE CASCADE,  -- nullable
    score        DOUBLE PRECISION NOT NULL,
    detected_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    summary      TEXT,
    window_start TIMESTAMPTZ,     -- sliding window start
    window_end   TIMESTAMPTZ,     -- sliding window end
    service_name TEXT             -- which service was anomalous
)
```

**Indexes**: `logs(timestamp DESC)`, `logs(severity)`, `logs(service_name)`,
`anomalies(log_id)`, `anomalies(score DESC)`, `anomalies(service_name)`,
`anomalies(window_start, window_end)`.

## Key Design Decisions

| Decision | Rationale |
|---|---|
| `stream.Publisher` interface | Decouples producer from transport; Kinesis swaps in without changing business logic |
| `pgx/v5 unnest()` bulk insert | Single SQL round-trip per batch vs. N individual INSERTs |
| Exponential backoff on DB connect | Consumer starts before DB is ready in Docker; avoids crash loops |
| `IF NOT EXISTS` migrations | Safe to re-run; no manual state tracking needed |
| JSONB `raw_json` column | Preserves full payload for future feature extraction (latency_ms, etc.) |
| IsolationForest (unsupervised) | No labeled anomaly data available; detects outliers without ground truth |
| Thread pool for model training | `IsolationForest.fit` is CPU-bound; offloaded to avoid blocking the async event loop |
| SSE over WebSocket | Unidirectional server→client push; simpler, no handshake overhead, HTTP/1.1 compatible |
| nginx proxy for `/api/` | Eliminates CORS in production; single origin for the browser |
| Separate Go modules per service | Each service has its own dependency graph; cleaner for mono-repo |
| `asyncpg` over `psycopg2` | Native async PostgreSQL driver; fits FastAPI's async model without thread overhead |

## Phases

- [x] Phase 1 — Go producer + consumer + PostgreSQL + Redis infra
- [x] Phase 2 — Python anomaly detection service (IsolationForest, FastAPI)
- [x] Phase 3 — React dashboard (live logs, anomaly timeline, alert cards)
- [ ] Phase 4 — LLM root-cause summarizer (Claude API)
