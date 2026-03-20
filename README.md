# logwatch

AI-powered log anomaly detector — portfolio project demonstrating stream
processing, distributed systems, and applied ML.

## Quick Start (Phase 1)

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker + Docker Compose v2)
- [Go 1.22+](https://go.dev/dl/)

### 1. Configure environment

```bash
cp .env.example .env
# Edit .env if you want to change passwords or ports.
```

### 2. Start infrastructure

```bash
cd infra
docker compose --env-file ../.env up -d
```

Docker Compose starts PostgreSQL 15 and Redis 7 with health checks. The
migration in `infra/migrations/001_init.sql` runs automatically on first start.

Wait until both services are healthy:

```bash
docker compose ps
# postgres: healthy  redis: healthy
```

### 3. Run the consumer (reads + writes to DB)

```bash
cd consumer
export $(grep -v '^#' ../.env | xargs)
go run .
```

The consumer starts the log producer internally, batches events, and writes
them to PostgreSQL. You should see structured JSON logs on stdout.

### 4. (Optional) Run the producer standalone

```bash
cd ingestion
export LOG_RATE=20
export ANOMALY_RATE=0.1
go run .
```

This runs the producer without a consumer — useful for inspecting the raw log
stream or testing the channel bus.

### 5. Verify data in PostgreSQL

```bash
docker exec -it logwatch_postgres \
  psql -U logwatch -d logwatch -c "SELECT severity, service_name, message FROM logs ORDER BY created_at DESC LIMIT 10;"
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
| `DATABASE_URL` | — | Full DSN for consumer (required) |
| `REDIS_PASSWORD` | — | Redis password (required) |
| `REDIS_PORT` | `6379` | Host port for Redis |
| `LOG_RATE` | `10` | Log events per second |
| `ANOMALY_RATE` | `0.05` | Fraction of events that are anomalous [0–1] |
| `BATCH_SIZE` | `50` | DB insert batch size |
| `FLUSH_INTERVAL_MS` | `2000` | Max ms between flushes |

See [`.env.example`](.env.example) for a complete reference.

## Project Structure

```
logwatch/
├── ingestion/              # Go — synthetic log producer
│   ├── main.go             # Entry point; reads env config
│   ├── producer/
│   │   ├── producer.go     # Core production logic
│   │   └── producer_test.go
│   └── stream/
│       ├── stream.go       # Publisher / Subscriber interfaces
│       └── channel_bus.go  # In-process implementation
│
├── consumer/               # Go — log consumer + DB writer
│   ├── main.go             # Entry point; wires producer → writer → DB
│   ├── batch/
│   │   ├── writer.go       # Buffered batch writer
│   │   └── writer_test.go
│   └── db/
│       └── db.go           # PostgreSQL store + retry logic
│
├── ml/                     # Python FastAPI — anomaly detection (Phase 2)
├── frontend/               # React + Express — dashboard (Phase 3)
│
├── infra/
│   ├── docker-compose.yml  # PostgreSQL 15 + Redis 7
│   └── migrations/
│       └── 001_init.sql    # Idempotent schema
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
- [ ] Phase 2 — Python anomaly detection (IsolationForest, FastAPI)
- [ ] Phase 3 — React dashboard (real-time stream, anomaly timeline)
- [ ] Phase 4 — LLM root-cause summarizer (Claude API)
