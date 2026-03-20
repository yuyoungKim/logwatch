# logwatch

AI-powered log anomaly detector — portfolio project demonstrating stream
processing, distributed systems, applied ML, and LLM integration.

## What it does

- Generates realistic structured logs from 3 simulated microservices
- Batch-inserts logs into PostgreSQL via a Go consumer
- Scores 60-second sliding windows with a scikit-learn IsolationForest
- Calls the Claude API to write plain-English root cause summaries for each anomaly
- Streams live logs and anomalies to a React dashboard via SSE
- Overview homepage with live metrics, pipeline diagram, and quick navigation

## Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker + Docker Compose v2)
- [Go 1.22+](https://go.dev/dl/) — only needed to run the consumer outside Docker
- An [Anthropic API key](https://console.anthropic.com/) — for Claude root cause summaries

### 1. Configure environment

```bash
cp .env.example .env
# Edit .env — set passwords and add your ANTHROPIC_API_KEY
```

### 2. Start the full stack

Run all commands from the **project root** (`logwatch/`):

```bash
docker compose --project-directory . -f infra/docker-compose.yml up --build -d
```

This starts 5 containers: PostgreSQL 15, Redis 7, ML service (FastAPI),
Express API server, and the React frontend. Migrations run automatically on
first start.

Wait until all services are healthy:

```bash
docker compose --project-directory . -f infra/docker-compose.yml ps
```

Open **http://localhost:3000** to view the dashboard.

### 3. Start the log producer + consumer

The Go consumer generates synthetic logs and writes them to PostgreSQL.
Run it in a separate terminal from the repo root:

```bash
cd consumer
export $(grep -v '^#' ../.env | xargs)
go run .
```

You should see structured JSON logs on stdout and the Live Logs tab in the
dashboard will start updating in real time.

### 4. Wait for anomaly summaries

The ML service collects 50 warmup windows (~8 minutes at the default 10s slide
interval) before the IsolationForest is ready to score. Once `model_ready` is
`true`, anomalies are detected automatically and Claude generates a 2-3 sentence
root cause summary for each one. Alert cards on the dashboard update from
"Analysis pending..." to the real summary within seconds of detection.

Check readiness:

```bash
curl -s http://localhost:8000/health | python3 -m json.tool
```

To speed up testing, temporarily set `WARMUP_WINDOWS=5` and
`ANOMALY_THRESHOLD=0.0` in `.env`, then restart the ML service:

```bash
docker compose --project-directory . -f infra/docker-compose.yml restart ml
```

### Ports

| Service | Port | Description |
|---|---|---|
| React dashboard | 3000 | Frontend UI |
| Express API | 3001 | REST + SSE endpoints |
| ML service | 8000 | FastAPI anomaly scorer + Claude summarizer |
| PostgreSQL | 5432 | Primary data store |
| Redis | 6379 | Reserved |

### Stop everything

```bash
docker compose --project-directory . -f infra/docker-compose.yml down      # stop, keep data
docker compose --project-directory . -f infra/docker-compose.yml down -v   # stop + wipe volumes
```

## Running Tests

```bash
# Ingestion unit tests
cd ingestion && go test ./... -v

# Consumer unit tests (no DB required — uses mocks)
cd consumer && go test ./... -v
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_DB` | `logwatch` | Database name |
| `POSTGRES_USER` | `logwatch` | Database user |
| `POSTGRES_PASSWORD` | — | Database password (required) |
| `POSTGRES_PORT` | `5432` | Host port for PostgreSQL |
| `DATABASE_URL` | — | Full DSN for consumer and API server |
| `REDIS_PASSWORD` | — | Redis password (required) |
| `REDIS_PORT` | `6379` | Host port for Redis |
| `LOG_RATE` | `10` | Log events per second |
| `ANOMALY_RATE` | `0.05` | Fraction of events that are anomalous [0–1] |
| `BATCH_SIZE` | `50` | DB insert batch size |
| `FLUSH_INTERVAL_MS` | `2000` | Max ms between flushes |
| `ANOMALY_THRESHOLD` | `-0.1` | IsolationForest score cutoff (lower = stricter) |
| `WINDOW_SECONDS` | `60` | Sliding window duration |
| `SLIDE_SECONDS` | `10` | Slide interval |
| `WARMUP_WINDOWS` | `50` | Windows to collect before first model fit |
| `RETRAIN_INTERVAL_SECONDS` | `1800` | How often to refit the model |
| `ANTHROPIC_API_KEY` | — | Anthropic API key for Claude summaries (required for Phase 4) |
| `SUMMARIZER_ENABLED` | `true` | Set to `false` to disable Claude summaries without redeploying |

See [`.env.example`](.env.example) for a complete reference.

## Project Structure

```
logwatch/
├── ingestion/              # Go — synthetic log producer
│   ├── main.go
│   ├── producer/
│   │   ├── producer.go     # Generates logs for 3 services + anomaly injection
│   │   └── producer_test.go
│   └── stream/
│       ├── stream.go       # Publisher / Subscriber interfaces
│       └── channel_bus.go  # In-process channel implementation
│
├── consumer/               # Go — log consumer + DB writer
│   ├── main.go             # Wires producer → batch writer → PostgreSQL
│   ├── batch/
│   │   ├── writer.go       # Buffered batch writer with graceful shutdown
│   │   └── writer_test.go
│   └── db/
│       └── db.go           # pgxpool store, unnest bulk INSERT, retry logic
│
├── ml/                     # Python — anomaly detection + AI summarizer
│   ├── main.py             # FastAPI app (GET /health, /anomalies, POST /score)
│   ├── detector.py         # Sliding-window IsolationForest + retrain loop
│   ├── summarizer.py       # Claude API integration — root cause summaries
│   ├── db.py               # asyncpg pool + query helpers
│   ├── models.py           # Pydantic request/response models
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/
│   ├── server/             # Node.js + Express — REST + SSE API (port 3001)
│   │   ├── index.js
│   │   ├── db.js           # pg.Pool
│   │   ├── routes/
│   │   │   ├── logs.js       # GET /api/logs
│   │   │   ├── anomalies.js  # GET /api/anomalies (includes summary field)
│   │   │   ├── stats.js      # GET /api/stats
│   │   │   └── stream.js     # GET /api/stream (SSE)
│   │   └── Dockerfile
│   │
│   └── client/             # React + Vite + TypeScript (port 3000)
│       ├── src/
│       │   ├── types/        # Log, Anomaly, Stats types
│       │   ├── hooks/        # useSSE, useLogs, useAnomalies, useStats
│       │   └── components/
│       │       ├── Layout.tsx
│       │       ├── LogFeed/          # Live scrolling log table
│       │       ├── AnomalyTimeline/  # recharts LineChart per service
│       │       ├── HomePage/         # Overview landing page with live metrics + pipeline
      │       └── AlertCards/       # WARNING / CRITICAL cards with AI summary
│       ├── nginx.conf        # Proxies /api/ to Express server
│       └── Dockerfile        # Multi-stage: node build → nginx serve
│
├── infra/
│   ├── docker-compose.yml  # All 5 services: postgres, redis, ml, api, frontend
│   └── migrations/
│       ├── 001_init.sql    # logs + anomalies tables, indexes
│       └── 002_anomaly_window.sql  # window_start/end, service_name on anomalies
│
├── .env.example
├── ARCHITECTURE.md
└── README.md
```

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full system design, data model,
and key engineering decisions.

## Roadmap

- [x] Phase 1 — Go producer + consumer + PostgreSQL + Redis
- [x] Phase 2 — Python anomaly detection (IsolationForest, FastAPI)
- [x] Phase 3 — React dashboard (live logs, anomaly timeline, alert cards)
- [x] Phase 4 — Claude API root cause summarizer
- [x] Phase 5 — Overview homepage with live metrics and pipeline diagram
