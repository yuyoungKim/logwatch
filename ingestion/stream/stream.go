// Package stream defines the publisher interface for log events.
// The channel-based implementation is used locally; swap in a Kinesis
// implementation without touching producer code.
package stream

import "context"

// LogEvent is the unit of data flowing through the pipeline.
type LogEvent struct {
	Timestamp   string `json:"timestamp"`
	Severity    string `json:"severity"`
	ServiceName string `json:"service_name"`
	Message     string `json:"message"`
	RequestID   string `json:"request_id,omitempty"`
	RawJSON     []byte `json:"raw_json"`
}

// Publisher sends log events to a downstream consumer.
type Publisher interface {
	Publish(ctx context.Context, event LogEvent) error
	Close() error
}

// Subscriber receives log events from an upstream producer.
type Subscriber interface {
	Subscribe() <-chan LogEvent
	Close() error
}

// Bus combines Publisher and Subscriber over an in-process channel.
type Bus interface {
	Publisher
	Subscriber
}
