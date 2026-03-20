package producer_test

import (
	"context"
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/yuyoungKim/logwatch/ingestion/producer"
	"github.com/yuyoungKim/logwatch/ingestion/stream"
)

// mockPublisher records every event published to it.
type mockPublisher struct {
	events []stream.LogEvent
}

func (m *mockPublisher) Publish(_ context.Context, e stream.LogEvent) error {
	m.events = append(m.events, e)
	return nil
}

func (m *mockPublisher) Close() error { return nil }

func TestProducerEmitsEvents(t *testing.T) {
	t.Parallel()

	cfg := producer.Config{
		LogRate:     100, // fast for testing
		AnomalyRate: 0.5,
		Services:    []string{"auth-service", "payment-service", "api-gateway"},
	}
	pub := &mockPublisher{}
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	p := producer.New(cfg, pub, logger)

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	if err := p.Run(ctx); err != nil {
		t.Fatalf("Run returned unexpected error: %v", err)
	}

	if len(pub.events) == 0 {
		t.Fatal("expected at least one event to be published")
	}

	// Validate every event has required fields.
	for i, ev := range pub.events {
		if ev.Severity == "" {
			t.Errorf("event[%d]: empty severity", i)
		}
		if ev.ServiceName == "" {
			t.Errorf("event[%d]: empty service_name", i)
		}
		if ev.Message == "" {
			t.Errorf("event[%d]: empty message", i)
		}
		if len(ev.RawJSON) == 0 {
			t.Errorf("event[%d]: empty raw_json", i)
		}
	}
}

func TestProducerInvalidLogRate(t *testing.T) {
	t.Parallel()

	cfg := producer.Config{
		LogRate:  0,
		Services: []string{"auth-service"},
	}
	pub := &mockPublisher{}
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))
	p := producer.New(cfg, pub, logger)

	err := p.Run(context.Background())
	if err == nil {
		t.Fatal("expected error for zero LogRate, got nil")
	}
}

func TestProducerServicesAreSampled(t *testing.T) {
	t.Parallel()

	services := []string{"auth-service", "payment-service", "api-gateway"}
	cfg := producer.Config{
		LogRate:     500,
		AnomalyRate: 0.1,
		Services:    services,
	}
	pub := &mockPublisher{}
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	p := producer.New(cfg, pub, logger)

	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	_ = p.Run(ctx)

	seen := map[string]bool{}
	for _, ev := range pub.events {
		seen[ev.ServiceName] = true
	}
	for _, svc := range services {
		if !seen[svc] {
			t.Errorf("service %q never appeared in %d events", svc, len(pub.events))
		}
	}
}
