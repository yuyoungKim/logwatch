package batch_test

import (
	"context"
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/yuyoungKim/logwatch/consumer/batch"
	"github.com/yuyoungKim/logwatch/consumer/db"
	"github.com/yuyoungKim/logwatch/ingestion/stream"
)

// --- Test doubles ---

type mockStore struct {
	rows     []db.LogRow
	pingErr  error
	insertErr error
}

func (m *mockStore) BatchInsertLogs(_ context.Context, rows []db.LogRow) error {
	if m.insertErr != nil {
		return m.insertErr
	}
	m.rows = append(m.rows, rows...)
	return nil
}

func (m *mockStore) Ping(_ context.Context) error { return m.pingErr }
func (m *mockStore) Close()                        {}

// staticSubscriber feeds a fixed set of events then closes the channel.
type staticSubscriber struct {
	events []stream.LogEvent
	ch     chan stream.LogEvent
}

func newStaticSubscriber(events []stream.LogEvent) *staticSubscriber {
	ch := make(chan stream.LogEvent, len(events))
	for _, e := range events {
		ch <- e
	}
	close(ch)
	return &staticSubscriber{events: events, ch: ch}
}

func (s *staticSubscriber) Subscribe() <-chan stream.LogEvent { return s.ch }
func (s *staticSubscriber) Close() error                       { return nil }

// --- Tests ---

func TestWriterFlushesOnChannelClose(t *testing.T) {
	t.Parallel()

	events := []stream.LogEvent{
		{Timestamp: time.Now().UTC().Format(time.RFC3339Nano), Severity: "INFO", ServiceName: "auth-service", Message: "ok", RawJSON: []byte(`{}`)},
		{Timestamp: time.Now().UTC().Format(time.RFC3339Nano), Severity: "ERROR", ServiceName: "payment-service", Message: "fail", RawJSON: []byte(`{}`)},
	}

	store := &mockStore{}
	sub := newStaticSubscriber(events)
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))

	cfg := batch.Config{BatchSize: 50, FlushEvery: 10 * time.Second}
	w := batch.New(cfg, store, sub, logger)

	ctx := context.Background()
	if err := w.Run(ctx); err != nil {
		t.Fatalf("Run returned error: %v", err)
	}

	if len(store.rows) != len(events) {
		t.Errorf("expected %d rows persisted, got %d", len(events), len(store.rows))
	}
}

func TestWriterFlushesOnBatchFull(t *testing.T) {
	t.Parallel()

	const batchSize = 3
	// 5 events -> triggers one early flush at 3, then remaining 2 on close.
	events := make([]stream.LogEvent, 5)
	for i := range events {
		events[i] = stream.LogEvent{
			Timestamp:   time.Now().UTC().Format(time.RFC3339Nano),
			Severity:    "INFO",
			ServiceName: "api-gateway",
			Message:     "ping",
			RawJSON:     []byte(`{}`),
		}
	}

	store := &mockStore{}
	sub := newStaticSubscriber(events)
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))

	cfg := batch.Config{BatchSize: batchSize, FlushEvery: 10 * time.Second}
	w := batch.New(cfg, store, sub, logger)

	if err := w.Run(context.Background()); err != nil {
		t.Fatalf("Run returned error: %v", err)
	}
	if len(store.rows) != len(events) {
		t.Errorf("expected %d rows, got %d", len(events), len(store.rows))
	}
}

func TestWriterSkipsInvalidEvents(t *testing.T) {
	t.Parallel()

	events := []stream.LogEvent{
		{Severity: "", ServiceName: "svc", Message: "bad — no severity", RawJSON: []byte(`{}`)},
		{Timestamp: time.Now().UTC().Format(time.RFC3339Nano), Severity: "INFO", ServiceName: "svc", Message: "good", RawJSON: []byte(`{}`)},
	}

	store := &mockStore{}
	sub := newStaticSubscriber(events)
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))

	cfg := batch.Config{BatchSize: 50, FlushEvery: 10 * time.Second}
	w := batch.New(cfg, store, sub, logger)

	if err := w.Run(context.Background()); err != nil {
		t.Fatalf("Run returned error: %v", err)
	}
	// Only 1 valid event should be persisted.
	if len(store.rows) != 1 {
		t.Errorf("expected 1 row, got %d", len(store.rows))
	}
}
