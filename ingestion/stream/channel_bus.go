package stream

import (
	"context"
	"fmt"
)

// ChannelBus is an in-process Bus backed by a buffered Go channel.
// It satisfies both Publisher and Subscriber.
type ChannelBus struct {
	ch     chan LogEvent
	closed chan struct{}
}

// NewChannelBus creates a ChannelBus with the given buffer size.
func NewChannelBus(bufSize int) *ChannelBus {
	return &ChannelBus{
		ch:     make(chan LogEvent, bufSize),
		closed: make(chan struct{}),
	}
}

// Publish sends a LogEvent to the channel. Returns an error if the bus
// is closed or the context is cancelled before the send completes.
func (b *ChannelBus) Publish(ctx context.Context, event LogEvent) error {
	select {
	case <-b.closed:
		return fmt.Errorf("stream: bus is closed")
	case <-ctx.Done():
		return ctx.Err()
	case b.ch <- event:
		return nil
	}
}

// Subscribe returns the read end of the event channel.
func (b *ChannelBus) Subscribe() <-chan LogEvent {
	return b.ch
}

// Close signals that no more events will be published and drains safely.
func (b *ChannelBus) Close() error {
	select {
	case <-b.closed:
		// already closed — idempotent
	default:
		close(b.closed)
		close(b.ch)
	}
	return nil
}
