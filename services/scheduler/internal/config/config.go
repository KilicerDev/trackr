// Package config resolves the scheduler configuration from the environment.
//
// The canonical .env lives at the repository root (shared with docker compose
// and the SvelteKit app). For host development the loader reads ../../.env
// relative to the working directory (services/scheduler) — values already set in
// the environment always win. Inside Docker no .env exists and configuration
// comes from compose.
package config

import (
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"

	"github.com/KilicerDev/trackr/services/shared/pg"
)

type Config struct {
	// Postgres connection string, resolved from DATABASE_URL or POSTGRES_*.
	DSN string

	// How often to scan `schedules` for due rows. SCHEDULER_POLL_INTERVAL, default 5s.
	PollInterval time.Duration
	// Maximum due schedules processed per tick (LIMIT). SCHEDULER_BATCH_SIZE, default 100.
	BatchSize int
	// Identifies this process in logs. SCHEDULER_ID, default hostname.
	SchedulerID string
}

func Load() (Config, error) {
	// Best effort — missing file is fine (compose injects env in prod).
	_ = godotenv.Load("../../.env")

	dsn, err := pg.ResolveDSN()
	if err != nil {
		return Config{}, err
	}

	cfg := Config{
		DSN:          dsn,
		PollInterval: durationEnv("SCHEDULER_POLL_INTERVAL", 5*time.Second),
		BatchSize:    intEnv("SCHEDULER_BATCH_SIZE", 100),
		SchedulerID:  os.Getenv("SCHEDULER_ID"),
	}

	if cfg.SchedulerID == "" {
		host, err := os.Hostname()
		if err != nil || host == "" {
			host = fmt.Sprintf("scheduler-%d", os.Getpid())
		}
		cfg.SchedulerID = host
	}

	return cfg, nil
}

func intEnv(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return fallback
}

func durationEnv(key string, fallback time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil && d > 0 {
			return d
		}
	}
	return fallback
}
