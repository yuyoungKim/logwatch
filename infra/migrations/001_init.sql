-- Migration: 001_init
-- Idempotent: safe to run multiple times

BEGIN;

-- Severity enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'log_severity') THEN
        CREATE TYPE log_severity AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR');
    END IF;
END$$;

-- logs table
CREATE TABLE IF NOT EXISTS logs (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp   TIMESTAMPTZ NOT NULL,
    severity    log_severity NOT NULL,
    service_name TEXT       NOT NULL,
    message     TEXT        NOT NULL,
    request_id  TEXT,
    raw_json    JSONB       NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- anomalies table
CREATE TABLE IF NOT EXISTS anomalies (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    log_id      UUID        NOT NULL REFERENCES logs(id) ON DELETE CASCADE,
    score       DOUBLE PRECISION NOT NULL,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    summary     TEXT
);

-- Indexes (IF NOT EXISTS requires PG 9.5+, always safe)
CREATE INDEX IF NOT EXISTS idx_logs_timestamp    ON logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_severity     ON logs (severity);
CREATE INDEX IF NOT EXISTS idx_logs_service_name ON logs (service_name);
CREATE INDEX IF NOT EXISTS idx_anomalies_log_id  ON anomalies (log_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_score   ON anomalies (score DESC);

COMMIT;
