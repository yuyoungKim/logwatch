// Package batch implements a buffered log writer that accumulates events and
// flushes them to the database either when the batch is full or a ticker fires.
package batch

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/yuyoungKim/logwatch/consumer/db"
	"github.com/yuyoungKim/logwatch/ingestion/stream"
)

const (
	defaultBatchSize    = 50
	defaultFlushEvery   = 2 * time.Second
)

// Config controls the batch writer.
type Config struct {
	BatchSize  int
	FlushEvery time.Duration
}

// DefaultConfig returns production defaults.
func DefaultConfig() Config {
	return Config{
		BatchSize:  defaultBatchSize,
		FlushEvery: defaultFlushEvery,
	}
}

// Writer reads log events from a channel, validates and accumulates them, then
// bulk-inserts into the database.
type Writer struct {
	cfg    Config
	store  db.Store
	sub    stream.Subscriber
	logger *slog.Logger
}

// New creates a Writer. All arguments are required.
func New(cfg Config, store db.Store, sub stream.Subscriber, logger *slog.Logger) *Writer {
	return &Writer{
		cfg:    cfg,
		store:  store,
		sub:    sub,
		logger: logger,
	}
}

// Run consumes events until the subscriber channel is closed or ctx is
// cancelled. It guarantees a final flush on shutdown.
func (w *Writer) Run(ctx context.Context) error {
	ticker := time.NewTicker(w.cfg.FlushEvery)
	defer ticker.Stop()

	buf := make([]db.LogRow, 0, w.cfg.BatchSize)
	ch := w.sub.Subscribe()

	flush := func(reason string) {
		if len(buf) == 0 {
			return
		}
		flushCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := w.store.BatchInsertLogs(flushCtx, buf); err != nil {
			w.logger.Error("batch flush failed",
				slog.String("reason", reason),
				slog.Int("count", len(buf)),
				slog.Any("error", err),
			)
		} else {
			w.logger.Info("batch flushed",
				slog.String("reason", reason),
				slog.Int("count", len(buf)),
			)
		}
		buf = buf[:0]
	}

	w.logger.Info("batch writer started",
		slog.Int("batch_size", w.cfg.BatchSize),
		slog.Duration("flush_every", w.cfg.FlushEvery),
	)

	for {
		select {
		case event, ok := <-ch:
			if !ok {
				// Channel closed — drain and exit.
				flush("channel_closed")
				return nil
			}
			row, err := parseEvent(event)
			if err != nil {
				w.logger.Warn("skipping invalid log event", slog.Any("error", err))
				continue
			}
			buf = append(buf, row)
			if len(buf) >= w.cfg.BatchSize {
				flush("batch_full")
			}

		case <-ticker.C:
			flush("ticker")

		case <-ctx.Done():
			flush("shutdown")
			return nil
		}
	}
}

// parseEvent validates a stream.LogEvent and converts it to a db.LogRow.
func parseEvent(ev stream.LogEvent) (db.LogRow, error) {
	if ev.Severity == "" {
		return db.LogRow{}, fmt.Errorf("batch: missing severity in event")
	}
	if ev.ServiceName == "" {
		return db.LogRow{}, fmt.Errorf("batch: missing service_name in event")
	}
	if ev.Message == "" {
		return db.LogRow{}, fmt.Errorf("batch: missing message in event")
	}

	var ts time.Time
	var err error
	if ev.Timestamp != "" {
		ts, err = time.Parse(time.RFC3339Nano, ev.Timestamp)
		if err != nil {
			return db.LogRow{}, fmt.Errorf("batch: parse timestamp %q: %w", ev.Timestamp, err)
		}
	} else {
		ts = time.Now().UTC()
	}

	// Validate severity is one of the allowed enum values.
	switch ev.Severity {
	case "DEBUG", "INFO", "WARN", "ERROR":
	default:
		return db.LogRow{}, fmt.Errorf("batch: unknown severity %q", ev.Severity)
	}

	// Validate raw_json is valid JSON if provided.
	rawJSON := ev.RawJSON
	if len(rawJSON) == 0 || !json.Valid(rawJSON) {
		rawJSON = []byte("{}")
	}

	return db.LogRow{
		Timestamp:   ts,
		Severity:    ev.Severity,
		ServiceName: ev.ServiceName,
		Message:     ev.Message,
		RequestID:   ev.RequestID,
		RawJSON:     rawJSON,
	}, nil
}
