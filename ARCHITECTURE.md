# Logwatch — AI Log Anomaly Detector

## Stack
- **Ingestion**: Go (slog, AWS Kinesis-compatible)
- **Processing**: Go consumer + PostgreSQL
- **ML**: Python FastAPI + scikit-learn IsolationForest
- **LLM**: Claude API (stretch goal — root cause summaries)
- **Frontend**: React + Node.js/Express

## Phases
- [ ] Phase 1: Go producer + consumer + Postgres
- [ ] Phase 2: Python anomaly detection service
- [ ] Phase 3: React dashboard
- [ ] Phase 4: LLM root cause summarizer

## Running locally
```bash
docker-compose up -d   # starts Postgres + Redis
```