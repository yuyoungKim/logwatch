package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"strconv"
	"syscall"

	"github.com/yuyoungKim/logwatch/ingestion/producer"
	"github.com/yuyoungKim/logwatch/ingestion/stream"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	}))

	cfg := loadConfig(logger)

	bus := stream.NewChannelBus(1024)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	p := producer.New(cfg, bus, logger)

	// Log events are written to stdout in JSON format so the consumer (or any
	// downstream system) can tail this process's output.  In Phase 2, the bus
	// will be replaced with a Kinesis publisher; this main.go stays unchanged.
	logger.Info("logwatch ingestion service starting")

	if err := p.Run(ctx); err != nil {
		logger.Error("producer exited with error", slog.Any("error", err))
		os.Exit(1)
	}

	logger.Info("logwatch ingestion service stopped")
}

// loadConfig reads configuration from environment variables with safe defaults.
func loadConfig(logger *slog.Logger) producer.Config {
	cfg := producer.DefaultConfig()

	if v := os.Getenv("LOG_RATE"); v != "" {
		rate, err := strconv.ParseFloat(v, 64)
		if err != nil || rate <= 0 {
			logger.Warn("invalid LOG_RATE, using default",
				slog.String("value", v),
				slog.Float64("default", cfg.LogRate),
			)
		} else {
			cfg.LogRate = rate
		}
	}

	if v := os.Getenv("ANOMALY_RATE"); v != "" {
		rate, err := strconv.ParseFloat(v, 64)
		if err != nil || rate < 0 || rate > 1 {
			logger.Warn("invalid ANOMALY_RATE, using default",
				slog.String("value", v),
				slog.Float64("default", cfg.AnomalyRate),
			)
		} else {
			cfg.AnomalyRate = rate
		}
	}

	return cfg
}
