// Package config resolves the worker configuration from the environment.
//
// The canonical .env lives at the repository root (shared with docker compose
// and the SvelteKit app). For host development the loader reads ../../.env
// relative to the working directory (services/worker) — values already set in
// the environment always win. Inside Docker no .env exists and configuration
// comes from compose.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"

	"github.com/KilicerDev/trackr/services/shared/health"
	"github.com/KilicerDev/trackr/services/shared/pg"
)

type Config struct {
	// Postgres connection string, resolved from DATABASE_URL or POSTGRES_*.
	DSN string

	// Number of concurrent claim loops. WORKER_CONCURRENCY, default 4.
	Concurrency int
	// Per-job handler timeout. Must be below ReapAfter or the reaper may re-queue
	// a job that is still running. WORKER_JOB_TIMEOUT, default 4m.
	JobTimeout time.Duration
	// How long a slot waits after finding an empty queue before polling again.
	// With Notify on this is the fallback (a NOTIFY wakes a slot sooner, and the
	// poll still catches delayed/retry jobs and missed notifications).
	// WORKER_POLL_INTERVAL, default 1s.
	PollInterval time.Duration
	// Enable LISTEN/NOTIFY for instant job pickup. Disable behind a transaction-
	// mode pooler that drops LISTEN/NOTIFY (then pickup latency is PollInterval).
	// WORKER_NOTIFY, default true.
	Notify bool
	// How often a running job updates its heartbeat. Must be below ReapAfter.
	// WORKER_HEARTBEAT, default 30s.
	HeartbeatInterval time.Duration
	// A running job whose heartbeat is older than this is re-queued (its worker
	// is presumed dead). Must exceed JobTimeout and HeartbeatInterval.
	// WORKER_REAP_AFTER, default 5m.
	ReapAfter time.Duration
	// Retry backoff: scheduled_at = now() + min(Base * 2^attempt, Cap).
	// WORKER_BACKOFF_BASE, default 10s; WORKER_BACKOFF_CAP, default 10m.
	BackoffBase time.Duration
	BackoffCap  time.Duration
	// Restrict this worker to these job types (empty = all). Lets a deployment be
	// pinned to a subset (e.g. a GPU box only "video.transcode"). WORKER_JOB_TYPES.
	JobTypes []string
	// Identifies this process in logs. WORKER_ID, default hostname.
	WorkerID string
	// Listen address for the HTTP health probes (/healthz, /healthz/ready).
	// HEALTH_PORT, falling back to PORT (injected by `skali dev`), default 8081.
	HealthAddr string

	// SMTP / mail — consumed by the mail.send handler. SMTP_HOST empty → the
	// worker logs emails instead of sending them (zero-config dev). Mirrors the
	// vars the web app used before email moved onto the queue.
	SmtpHost   string // SMTP_HOST
	SmtpPort   int    // SMTP_PORT, default 587
	SmtpSecure bool   // SMTP_SECURE, default true when port is 465
	SmtpUser   string // SMTP_USER
	SmtpPass   string // SMTP_PASS
	EmailFrom  string // EMAIL_FROM — default From for outgoing mail

	// APNs — consumed by the push.send handler. All four required for push to
	// be active; with any missing the handler acks jobs as skipped. The key is
	// the .p8 from the Apple Developer portal (PEM content or a file path).
	ApnsKey         string // APNS_KEY
	ApnsKeyID       string // APNS_KEY_ID
	ApnsTeamID      string // APNS_TEAM_ID
	ApnsBundleID    string // APNS_BUNDLE_ID
	ApnsEnvironment string // APNS_ENV — production (default) | development

	// Outbound webhooks — consumed by the webhook.deliver handler.
	WebhookTimeout      time.Duration // WEBHOOK_TIMEOUT, default 10s (per attempt)
	WebhookMaxBody      int           // WEBHOOK_MAX_BODY, default 2048 bytes kept from responses
	WebhookAllowPrivate bool          // WEBHOOK_ALLOW_PRIVATE_URLS, default false — dev only
}

func Load() (Config, error) {
	// Best effort — missing file is fine (compose injects env in prod).
	_ = godotenv.Load("../../.env")

	dsn, err := pg.ResolveDSN()
	if err != nil {
		return Config{}, err
	}

	smtpPort := intEnv("SMTP_PORT", 587)

	cfg := Config{
		DSN:                 dsn,
		Concurrency:         intEnv("WORKER_CONCURRENCY", 4),
		JobTimeout:          durationEnv("WORKER_JOB_TIMEOUT", 4*time.Minute),
		PollInterval:        durationEnv("WORKER_POLL_INTERVAL", time.Second),
		Notify:              boolEnv("WORKER_NOTIFY", true),
		HeartbeatInterval:   durationEnv("WORKER_HEARTBEAT", 30*time.Second),
		ReapAfter:           durationEnv("WORKER_REAP_AFTER", 5*time.Minute),
		BackoffBase:         durationEnv("WORKER_BACKOFF_BASE", 10*time.Second),
		BackoffCap:          durationEnv("WORKER_BACKOFF_CAP", 10*time.Minute),
		JobTypes:            listEnv("WORKER_JOB_TYPES"),
		WorkerID:            os.Getenv("WORKER_ID"),
		HealthAddr:          health.AddrFromEnv(),
		SmtpHost:            os.Getenv("SMTP_HOST"),
		SmtpPort:            smtpPort,
		SmtpSecure:          boolEnv("SMTP_SECURE", smtpPort == 465),
		SmtpUser:            os.Getenv("SMTP_USER"),
		SmtpPass:            os.Getenv("SMTP_PASS"),
		EmailFrom:           os.Getenv("EMAIL_FROM"),
		ApnsKey:             os.Getenv("APNS_KEY"),
		ApnsKeyID:           os.Getenv("APNS_KEY_ID"),
		ApnsTeamID:          os.Getenv("APNS_TEAM_ID"),
		ApnsBundleID:        os.Getenv("APNS_BUNDLE_ID"),
		ApnsEnvironment:     os.Getenv("APNS_ENV"),
		WebhookTimeout:      durationEnv("WEBHOOK_TIMEOUT", 10*time.Second),
		WebhookMaxBody:      intEnv("WEBHOOK_MAX_BODY", 2048),
		WebhookAllowPrivate: boolEnv("WEBHOOK_ALLOW_PRIVATE_URLS", false),
	}

	if cfg.WorkerID == "" {
		host, err := os.Hostname()
		if err != nil || host == "" {
			host = fmt.Sprintf("worker-%d", os.Getpid())
		}
		cfg.WorkerID = host
	}

	if cfg.JobTimeout >= cfg.ReapAfter {
		return Config{}, fmt.Errorf(
			"WORKER_JOB_TIMEOUT (%s) must be shorter than WORKER_REAP_AFTER (%s)",
			cfg.JobTimeout, cfg.ReapAfter,
		)
	}
	if cfg.HeartbeatInterval >= cfg.ReapAfter {
		return Config{}, fmt.Errorf(
			"WORKER_HEARTBEAT (%s) must be shorter than WORKER_REAP_AFTER (%s)",
			cfg.HeartbeatInterval, cfg.ReapAfter,
		)
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

func boolEnv(key string, fallback bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes":
		return true
	case "0", "false", "no":
		return false
	default:
		return fallback
	}
}

func durationEnv(key string, fallback time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil && d > 0 {
			return d
		}
	}
	return fallback
}

// listEnv parses a comma-separated env var into a trimmed, non-empty slice.
// Returns nil when unset/empty.
func listEnv(key string) []string {
	v := os.Getenv(key)
	if v == "" {
		return nil
	}
	var out []string
	for _, part := range strings.Split(v, ",") {
		if s := strings.TrimSpace(part); s != "" {
			out = append(out, s)
		}
	}
	return out
}
