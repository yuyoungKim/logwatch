-- Migration: 002_anomaly_window
-- Adds sliding-window columns to anomalies so the ML service can record
-- batch/window-level anomalies rather than only per-log anomalies.
-- Idempotent: safe to run multiple times.

BEGIN;

ALTER TABLE anomalies ADD COLUMN IF NOT EXISTS window_start TIMESTAMPTZ;
ALTER TABLE anomalies ADD COLUMN IF NOT EXISTS window_end   TIMESTAMPTZ;
ALTER TABLE anomalies ADD COLUMN IF NOT EXISTS service_name TEXT;

-- log_id is now optional: window anomalies have no single source row.
ALTER TABLE anomalies ALTER COLUMN log_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_anomalies_service ON anomalies (service_name);
CREATE INDEX IF NOT EXISTS idx_anomalies_window  ON anomalies (window_start, window_end);

COMMIT;
