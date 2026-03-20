package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/yuyoungKim/logwatch/consumer/batch"
	"github.com/yuyoungKim/logwatch/consumer/db"
	"github.com/yuyoungKim/logwatch/ingestion/producer"
	"github.com/yuyoungKim/logwatch/ingestion/stream"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	}))

	if err := run(logger); err != nil {
		logger.Error("fatal error", slog.Any("error", err))
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// --- Database ---
	dsn := requireEnv("DATABASE_URL")
	store, err := db.NewPgStore(ctx, dsn, 10, logger)
	if err != nil {
		return fmt.Errorf("connect to database: %w", err)
	}
	defer store.Close()

	// --- Shared in-process bus ---
	bus := stream.NewChannelBus(1024)

	// --- Producer (runs in background goroutine) ---
	prodCfg := loadProducerConfig(logger)
	prod := producer.New(prodCfg, bus, logger)

	prodErrCh := make(chan error, 1)
	go func() {
		prodErrCh <- prod.Run(ctx)
		// Close the bus so the batch writer knows there are no more events.
		if err := bus.Close(); err != nil {
			logger.Error("bus close error", slog.Any("error", err))
		}
	}()

	// --- Batch writer (runs in this goroutine) ---
	writerCfg := loadWriterConfig(logger)
	writer := batch.New(writerCfg, store, bus, logger)

	logger.Info("logwatch consumer starting")
	if err := writer.Run(ctx); err != nil {
		return fmt.Errorf("batch writer: %w", err)
	}

	// Wait for producer to finish cleanly.
	if err := <-prodErrCh; err != nil {
		return fmt.Errorf("producer: %w", err)
	}

	logger.Info("logwatch consumer stopped cleanly")
	return nil
}

// requireEnv returns the value of an env var or exits with a clear message.
func requireEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		fmt.Fprintf(os.Stderr, "fatal: required environment variable %q is not set\n", key)
		os.Exit(1)
	}
	return v
}

func loadProducerConfig(logger *slog.Logger) producer.Config {
	cfg := producer.DefaultConfig()
	if v := os.Getenv("LOG_RATE"); v != "" {
		if r, err := strconv.ParseFloat(v, 64); err == nil && r > 0 {
			cfg.LogRate = r
		} else {
			logger.Warn("invalid LOG_RATE, using default", slog.String("value", v))
		}
	}
	if v := os.Getenv("ANOMALY_RATE"); v != "" {
		if r, err := strconv.ParseFloat(v, 64); err == nil && r >= 0 && r <= 1 {
			cfg.AnomalyRate = r
		} else {
			logger.Warn("invalid ANOMALY_RATE, using default", slog.String("value", v))
		}
	}
	return cfg
}

func loadWriterConfig(logger *slog.Logger) batch.Config {
	cfg := batch.DefaultConfig()
	if v := os.Getenv("BATCH_SIZE"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.BatchSize = n
		} else {
			logger.Warn("invalid BATCH_SIZE, using default", slog.String("value", v))
		}
	}
	if v := os.Getenv("FLUSH_INTERVAL_MS"); v != "" {
		if ms, err := strconv.Atoi(v); err == nil && ms > 0 {
			cfg.FlushEvery = time.Duration(ms) * time.Millisecond
		} else {
			logger.Warn("invalid FLUSH_INTERVAL_MS, using default", slog.String("value", v))
		}
	}
	return cfg
}
