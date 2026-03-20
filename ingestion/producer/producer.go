// Package producer generates realistic synthetic log streams for three
// microservices and injects configurable anomalies (burst errors, slow
// requests). All external dependencies are behind interfaces so the
// producer is fully unit-testable without a real bus.
package producer

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math/rand"
	"time"

	"github.com/google/uuid"
	"github.com/yuyoungKim/logwatch/ingestion/stream"
)

// Config controls the log producer behaviour.
type Config struct {
	// LogRate is the number of log events emitted per second across all services.
	LogRate float64
	// AnomalyRate is the probability [0,1] that any given log event is anomalous.
	AnomalyRate float64
	// Services is the list of microservice names to simulate.
	Services []string
}

// DefaultConfig returns production-like defaults.
func DefaultConfig() Config {
	return Config{
		LogRate:     10.0,
		AnomalyRate: 0.05,
		Services:    []string{"auth-service", "payment-service", "api-gateway"},
	}
}

// Producer emits synthetic log events to a stream.Publisher.
type Producer struct {
	cfg    Config
	pub    stream.Publisher
	logger *slog.Logger
	rng    *rand.Rand
}

// New creates a Producer. logger must not be nil.
func New(cfg Config, pub stream.Publisher, logger *slog.Logger) *Producer {
	return &Producer{
		cfg:    cfg,
		pub:    pub,
		logger: logger,
		rng:    rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

// Run emits log events until ctx is cancelled or an unrecoverable error
// occurs. It blocks the calling goroutine.
func (p *Producer) Run(ctx context.Context) error {
	if p.cfg.LogRate <= 0 {
		return fmt.Errorf("producer: LogRate must be > 0, got %f", p.cfg.LogRate)
	}
	interval := time.Duration(float64(time.Second) / p.cfg.LogRate)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	p.logger.Info("producer started",
		slog.Float64("log_rate", p.cfg.LogRate),
		slog.Float64("anomaly_rate", p.cfg.AnomalyRate),
		slog.Int("services", len(p.cfg.Services)),
	)

	for {
		select {
		case <-ctx.Done():
			p.logger.Info("producer shutting down", slog.String("reason", ctx.Err().Error()))
			return nil
		case <-ticker.C:
			event, err := p.generateEvent()
			if err != nil {
				p.logger.Error("failed to generate log event", slog.Any("error", err))
				continue
			}
			if err := p.pub.Publish(ctx, event); err != nil {
				// Context cancellation during publish is expected on shutdown.
				if ctx.Err() != nil {
					return nil
				}
				p.logger.Error("failed to publish log event", slog.Any("error", err))
			}
		}
	}
}

// generateEvent builds one synthetic LogEvent.
func (p *Producer) generateEvent() (stream.LogEvent, error) {
	service := p.cfg.Services[p.rng.Intn(len(p.cfg.Services))]
	isAnomaly := p.rng.Float64() < p.cfg.AnomalyRate

	severity, message, extra := p.buildLogContent(service, isAnomaly)
	requestID := uuid.New().String()
	now := time.Now().UTC()

	raw := map[string]any{
		"timestamp":    now.Format(time.RFC3339Nano),
		"severity":     severity,
		"service_name": service,
		"message":      message,
		"request_id":   requestID,
		"anomaly":      isAnomaly,
	}
	for k, v := range extra {
		raw[k] = v
	}

	rawJSON, err := json.Marshal(raw)
	if err != nil {
		return stream.LogEvent{}, fmt.Errorf("producer: marshal raw log: %w", err)
	}

	return stream.LogEvent{
		Timestamp:   now.Format(time.RFC3339Nano),
		Severity:    severity,
		ServiceName: service,
		Message:     message,
		RequestID:   requestID,
		RawJSON:     rawJSON,
	}, nil
}

// buildLogContent returns severity + message for the given service,
// injecting anomaly patterns when isAnomaly is true.
func (p *Producer) buildLogContent(service string, isAnomaly bool) (severity, message string, extra map[string]any) {
	extra = make(map[string]any)

	if isAnomaly {
		return p.anomalyContent(service, extra)
	}
	return p.normalContent(service, extra)
}

func (p *Producer) normalContent(service string, extra map[string]any) (string, string, map[string]any) {
	switch service {
	case "auth-service":
		latencyMs := p.rng.Intn(80) + 10
		extra["latency_ms"] = latencyMs
		extra["user_id"] = fmt.Sprintf("usr_%06d", p.rng.Intn(100000))
		severities := []string{"DEBUG", "INFO", "INFO", "INFO"}
		sev := severities[p.rng.Intn(len(severities))]
		msgs := []string{
			"token validated successfully",
			"user authenticated",
			"session refreshed",
			"password check passed",
		}
		return sev, msgs[p.rng.Intn(len(msgs))], extra

	case "payment-service":
		amount := float64(p.rng.Intn(50000)+100) / 100.0
		extra["amount_usd"] = amount
		extra["currency"] = "USD"
		extra["provider"] = []string{"stripe", "paypal", "braintree"}[p.rng.Intn(3)]
		latencyMs := p.rng.Intn(200) + 50
		extra["latency_ms"] = latencyMs
		msgs := []string{
			"payment processed successfully",
			"charge authorised",
			"refund issued",
			"subscription renewed",
		}
		return "INFO", msgs[p.rng.Intn(len(msgs))], extra

	default: // api-gateway
		statusCode := []int{200, 200, 200, 201, 204, 301}[p.rng.Intn(6)]
		extra["status_code"] = statusCode
		extra["method"] = []string{"GET", "POST", "PUT", "DELETE"}[p.rng.Intn(4)]
		extra["path"] = []string{"/api/v1/users", "/api/v1/orders", "/api/v1/products", "/health"}[p.rng.Intn(4)]
		extra["latency_ms"] = p.rng.Intn(150) + 5
		return "INFO", fmt.Sprintf("request handled: %d", statusCode), extra
	}
}

func (p *Producer) anomalyContent(service string, extra map[string]any) (string, string, map[string]any) {
	anomalyType := p.rng.Intn(3)
	switch anomalyType {
	case 0: // burst errors
		extra["error_burst"] = true
		extra["error_count"] = p.rng.Intn(50) + 20
		return "ERROR", fmt.Sprintf("[%s] burst of database connection errors: too many clients", service), extra

	case 1: // slow requests
		latencyMs := p.rng.Intn(9000) + 3000
		extra["latency_ms"] = latencyMs
		extra["slow_request"] = true
		return "WARN", fmt.Sprintf("[%s] request latency exceeded threshold: %dms", service, latencyMs), extra

	default: // crash/panic
		extra["stack_trace"] = "goroutine 1 [running]:\nmain.handleRequest(...)\n\t/app/main.go:42"
		return "ERROR", fmt.Sprintf("[%s] unhandled panic: runtime error: index out of range", service), extra
	}
}
