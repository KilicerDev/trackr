// The scheduler enqueues jobs for due rows in the `schedules` table — it turns
// "time passed" into "jobs exist" and never does real work itself. The worker
// drains whatever it enqueues. See /services/README.md.
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/KilicerDev/trackr/services/scheduler/internal/config"
	"github.com/KilicerDev/trackr/services/scheduler/internal/scheduler"
	"github.com/KilicerDev/trackr/services/shared/health"
	"github.com/KilicerDev/trackr/services/shared/pg"
)

// How long shutdown waits for an in-flight poll cycle before exiting.
const shutdownGrace = 30 * time.Second

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		logger.Error("invalid configuration", "error", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// Probes come up before the database connection so the platform's startup
	// and liveness checks pass while pg.Connect retries; readiness reports
	// "starting" until the pool exists and flips to 503 again once shutdown
	// begins (Drain), so a draining replica is never counted as ready.
	probes, err := health.Listen(cfg.HealthAddr, nil, logger)
	if err != nil {
		logger.Error("health listener failed", "addr", cfg.HealthAddr, "error", err)
		os.Exit(1)
	}
	probes.Start()
	defer probes.Close()
	context.AfterFunc(ctx, probes.Drain)

	pool, err := pg.Connect(ctx, cfg.DSN)
	if err != nil {
		logger.Error("postgres connection failed", "error", err)
		os.Exit(1)
	}
	defer pool.Close()
	probes.SetReady(pool.Ping)

	logger.Info("scheduler started",
		"schedulerId", cfg.SchedulerID,
		"pollInterval", cfg.PollInterval,
		"batchSize", cfg.BatchSize,
	)

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		scheduler.Run(ctx, logger, pool, cfg)
	}()

	<-ctx.Done()
	logger.Info("shutting down", "grace", shutdownGrace)

	done := make(chan struct{})
	go func() { wg.Wait(); close(done) }()
	select {
	case <-done:
		logger.Info("shutdown complete")
	case <-time.After(shutdownGrace):
		logger.Warn("shutdown grace expired")
	}
}
