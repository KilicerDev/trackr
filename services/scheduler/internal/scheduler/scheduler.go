// Package scheduler turns "time passed" into "jobs exist": it polls the
// `schedules` table for due rows and enqueues a job for each, then advances the
// schedule. It enqueues only — it never does real work. SELECT ... FOR UPDATE
// SKIP LOCKED makes it restart-safe and leader-safe by construction (concurrent
// replicas each grab a disjoint set of due rows, no leader election needed).
package scheduler

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/KilicerDev/trackr/services/scheduler/internal/config"
	"github.com/KilicerDev/trackr/services/shared/jobq"
)

// How long a single poll cycle may run, detached from shutdown so an in-flight
// tick completes cleanly during the grace period.
const tickTimeout = 30 * time.Second

// Run polls `schedules` and enqueues due jobs until ctx is cancelled.
func Run(ctx context.Context, logger *slog.Logger, pool *pgxpool.Pool, cfg config.Config) {
	ticker := time.NewTicker(cfg.PollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			tickCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), tickTimeout)
			enqueued, err := tick(tickCtx, logger, pool, cfg)
			cancel()
			if err != nil {
				if ctx.Err() == nil {
					logger.Warn("schedule tick failed", "error", err)
				}
				continue
			}
			if enqueued > 0 {
				logger.Info("enqueued scheduled jobs", "count", enqueued)
			}
		}
	}
}

type dueSchedule struct {
	id        string
	jobType   string
	payload   json.RawMessage
	interval  string
	dedupeKey *string
	nextRunAt time.Time
}

// tick enqueues jobs for all due schedules in a single transaction.
func tick(ctx context.Context, logger *slog.Logger, pool *pgxpool.Pool, cfg config.Config) (int, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `
		SELECT id, job_type, payload, interval, dedupe_key, next_run_at
		FROM schedules
		WHERE enabled AND next_run_at <= now()
		ORDER BY next_run_at
		FOR UPDATE SKIP LOCKED
		LIMIT $1`, cfg.BatchSize)
	if err != nil {
		return 0, err
	}

	// Collect the due rows before issuing enqueue/update queries: pgx cannot
	// interleave another query on the same tx while this cursor is open.
	var due []dueSchedule
	for rows.Next() {
		var s dueSchedule
		var payload []byte
		if err := rows.Scan(&s.id, &s.jobType, &payload, &s.interval, &s.dedupeKey, &s.nextRunAt); err != nil {
			rows.Close()
			return 0, err
		}
		s.payload = json.RawMessage(payload)
		due = append(due, s)
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}
	rows.Close()

	now := time.Now()
	enqueued := 0
	for _, s := range due {
		interval, err := time.ParseDuration(s.interval)
		if err != nil || interval <= 0 {
			logger.Warn("skipping schedule with invalid interval",
				"scheduleId", s.id, "interval", s.interval)
			continue
		}

		dedupeKey := ""
		if s.dedupeKey != nil {
			dedupeKey = *s.dedupeKey
		}

		_, inserted, err := jobq.Enqueue(ctx, tx, jobq.EnqueueParams{
			Type:      s.jobType,
			Payload:   s.payload,
			DedupeKey: dedupeKey,
		})
		if err != nil {
			return 0, err
		}
		if inserted {
			enqueued++
		} else {
			logger.Info("schedule fire suppressed by dedupe key",
				"scheduleId", s.id, "dedupeKey", dedupeKey)
		}

		// Advance next_run_at. Fixed-rate: anchor to the scheduled slot so a job
		// stays on its cadence even if the poller was briefly late. If that slot
		// is already in the past (e.g. after downtime), snap forward to avoid a
		// catch-up storm. Advance even when deduped — the schedule still fired.
		next := s.nextRunAt.Add(interval)
		if !next.After(now) {
			next = now.Add(interval)
		}
		if _, err := tx.Exec(ctx,
			`UPDATE schedules SET last_run_at = now(), next_run_at = $2 WHERE id = $1`,
			s.id, next); err != nil {
			return 0, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return enqueued, nil
}
