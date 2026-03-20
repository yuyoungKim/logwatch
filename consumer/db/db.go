// Package db provides the database abstraction layer.
// All storage operations are accessed through the Store interface,
// keeping the batch writer decoupled from any specific DB client.
package db

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// LogRow is the normalised representation of a log event ready to be persisted.
type LogRow struct {
	Timestamp   time.Time
	Severity    string
	ServiceName string
	Message     string
	RequestID   string
	RawJSON     []byte
}

// Store defines the persistence contract. Implementations must be safe for
// concurrent use (pgxpool already is).
type Store interface {
	// BatchInsertLogs inserts multiple log rows in a single round-trip.
	BatchInsertLogs(ctx context.Context, rows []LogRow) error
	// Ping verifies the database connection is alive.
	Ping(ctx context.Context) error
	// Close releases all resources held by the store.
	Close()
}

// PgStore is a PostgreSQL implementation of Store backed by pgxpool.
type PgStore struct {
	pool   *pgxpool.Pool
	logger *slog.Logger
}

// NewPgStore opens a connection pool with exponential-backoff retry.
// maxAttempts controls how many times to retry on failure before giving up.
func NewPgStore(ctx context.Context, dsn string, maxAttempts int, logger *slog.Logger) (*PgStore, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("db: parse DSN: %w", err)
	}
	cfg.MaxConns = 10
	cfg.MinConns = 2
	cfg.HealthCheckPeriod = 30 * time.Second

	var pool *pgxpool.Pool
	backoff := 500 * time.Millisecond
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		pool, err = pgxpool.NewWithConfig(ctx, cfg)
		if err == nil {
			if pingErr := pool.Ping(ctx); pingErr == nil {
				break
			} else {
				pool.Close()
				err = pingErr
			}
		}
		logger.Warn("database connection failed, retrying",
			slog.Int("attempt", attempt),
			slog.Int("max_attempts", maxAttempts),
			slog.Duration("backoff", backoff),
			slog.Any("error", err),
		)
		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("db: context cancelled while connecting: %w", ctx.Err())
		case <-time.After(backoff):
		}
		backoff = min(backoff*2, 30*time.Second)
	}
	if err != nil {
		return nil, fmt.Errorf("db: could not connect after %d attempts: %w", maxAttempts, err)
	}

	logger.Info("database connection established")
	return &PgStore{pool: pool, logger: logger}, nil
}

// BatchInsertLogs uses a COPY-based unnest bulk insert for efficiency.
func (s *PgStore) BatchInsertLogs(ctx context.Context, rows []LogRow) error {
	if len(rows) == 0 {
		return nil
	}

	// Build slices for each column — pgx unnest is significantly faster than
	// individual INSERT statements for batches.
	timestamps := make([]time.Time, len(rows))
	severities := make([]string, len(rows))
	services := make([]string, len(rows))
	messages := make([]string, len(rows))
	requestIDs := make([]*string, len(rows))
	rawJSONs := make([][]byte, len(rows))

	for i, r := range rows {
		timestamps[i] = r.Timestamp
		severities[i] = r.Severity
		services[i] = r.ServiceName
		messages[i] = r.Message
		if r.RequestID != "" {
			rid := r.RequestID
			requestIDs[i] = &rid
		}
		rawJSONs[i] = r.RawJSON
	}

	const query = `
		INSERT INTO logs (timestamp, severity, service_name, message, request_id, raw_json)
		SELECT
			unnest($1::timestamptz[]),
			unnest($2::log_severity[]),
			unnest($3::text[]),
			unnest($4::text[]),
			unnest($5::text[]),
			unnest($6::jsonb[])
	`

	_, err := s.pool.Exec(ctx, query,
		timestamps,
		severities,
		services,
		messages,
		requestIDs,
		rawJSONs,
	)
	if err != nil {
		return fmt.Errorf("db: batch insert logs: %w", err)
	}
	return nil
}

// Ping checks the database connection.
func (s *PgStore) Ping(ctx context.Context) error {
	return s.pool.Ping(ctx)
}

// Close releases the connection pool.
func (s *PgStore) Close() {
	s.pool.Close()
}

