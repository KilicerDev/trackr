// The worker drains the Postgres job queue. It wires up its dependencies and
// hands a set of handlers to the shared jobworker engine, which owns the whole
// lifecycle (claim/heartbeat/retry/reaper/cancellation/shutdown). Adding work is
// a new handler in internal/jobs — not a new copy of this loop. The bundled
// handlers are the mail service (mail.send) and retention jobs (prune.*).
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/KilicerDev/trackr/services/shared/health"
	"github.com/KilicerDev/trackr/services/shared/jobworker"
	"github.com/KilicerDev/trackr/services/shared/pg"
	"github.com/KilicerDev/trackr/services/worker/internal/config"
	"github.com/KilicerDev/trackr/services/worker/internal/jobs"
	"github.com/KilicerDev/trackr/services/worker/internal/mail"
	"github.com/KilicerDev/trackr/services/worker/internal/push"
	"github.com/KilicerDev/trackr/services/worker/internal/webhook"
)

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

	// Build the mail sender for the mail.send handler (SMTP, or a console sender
	// when SMTP_HOST is unset).
	mailer, err := mail.New(mail.Config{
		Host:     cfg.SmtpHost,
		Port:     cfg.SmtpPort,
		Secure:   cfg.SmtpSecure,
		Username: cfg.SmtpUser,
		Password: cfg.SmtpPass,
		From:     cfg.EmailFrom,
	}, logger)
	if err != nil {
		logger.Error("mail configuration invalid", "error", err)
		os.Exit(1)
	}

	// APNs client for push.send — optional: without the env vars the handler
	// acks push jobs as skipped, so a deployment without the key just runs.
	var apns *push.Client
	apnsCfg := push.Config{
		Key:         cfg.ApnsKey,
		KeyID:       cfg.ApnsKeyID,
		TeamID:      cfg.ApnsTeamID,
		BundleID:    cfg.ApnsBundleID,
		Environment: cfg.ApnsEnvironment,
	}
	if apnsCfg.Enabled() {
		apns, err = push.New(apnsCfg)
		if err != nil {
			logger.Error("apns configuration invalid", "error", err)
			os.Exit(1)
		}
		logger.Info("apns push enabled", "bundle", cfg.ApnsBundleID, "env", cfg.ApnsEnvironment)
	}

	// Outbound HTTP for webhook.deliver. Strict by default (https, public
	// addresses only); WEBHOOK_ALLOW_PRIVATE_URLS=true loosens it for local dev.
	hooks := webhook.NewClient(webhook.Config{
		Timeout:      cfg.WebhookTimeout,
		MaxBody:      cfg.WebhookMaxBody,
		AllowPrivate: cfg.WebhookAllowPrivate,
	})
	if cfg.WebhookAllowPrivate {
		logger.Warn("webhooks: private/loopback destinations allowed (WEBHOOK_ALLOW_PRIVATE_URLS)")
	}

	// Inject deps into handlers (explicit DI — no package globals).
	handlers := jobs.Register(jobs.Deps{DB: pool, Mailer: mailer, Push: apns, Webhooks: hooks})

	engine, err := jobworker.New(pool, jobworker.Config{
		Concurrency:       cfg.Concurrency,
		JobTimeout:        cfg.JobTimeout,
		PollInterval:      cfg.PollInterval,
		Notify:            cfg.Notify,
		HeartbeatInterval: cfg.HeartbeatInterval,
		ReapAfter:         cfg.ReapAfter,
		BackoffBase:       cfg.BackoffBase,
		BackoffCap:        cfg.BackoffCap,
		JobTypes:          cfg.JobTypes,
	}, handlers, logger.With("workerId", cfg.WorkerID))
	if err != nil {
		logger.Error("invalid worker configuration", "error", err)
		os.Exit(1)
	}

	if err := engine.Run(ctx); err != nil {
		logger.Error("worker stopped with error", "error", err)
		os.Exit(1)
	}
}
