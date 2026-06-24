// Package jobq is the Postgres job-queue contract shared by the producers and
// consumers of the queue (the scheduler enqueues, the worker claims/completes).
// It is the single Go definition of the `jobs` table's columns, status strings,
// and the SQL that drives claiming, heartbeating, retrying and reaping. The
// table itself is defined and migrated by /web
// (web/src/lib/server/db/jobs.schema.ts) — keep this in sync with it.
package jobq

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Job statuses. Lifecycle: queued → running → succeeded | failed→(retry)→queued | cancelled.
const (
	StatusQueued    = "queued"
	StatusRunning   = "running"
	StatusSucceeded = "succeeded"
	StatusFailed    = "failed"
	StatusCancelled = "cancelled"
)

// DefaultMaxAttempts applies when EnqueueParams.MaxAttempts is <= 0. Mirrors the
// web-side default (web/src/lib/server/jobs/index.ts) and the jobs.max_attempts
// column default.
const DefaultMaxAttempts = 5

// Querier is satisfied by *pgxpool.Pool and pgx.Tx, so the same operations run
// either directly against the pool or inside a transaction (e.g. the scheduler
// enqueues in the same tx that advances the schedule).
type Querier interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// Job is a claimed unit of work handed to a handler.
type Job struct {
	ID          string
	Type        string
	Payload     json.RawMessage
	Attempt     int // this run's attempt number (1-based, post-claim)
	MaxAttempts int
}

// EnqueueParams describes a job to insert.
type EnqueueParams struct {
	Type        string
	Payload     json.RawMessage
	MaxAttempts int
	// Priority orders claiming: higher is claimed sooner; 0 is the default (none).
	Priority int
	// ScheduledAt is the earliest the job may run; zero means now().
	ScheduledAt time.Time
	// DedupeKey, when non-empty, enforces at-most-one-unfinished-job per
	// (Type, DedupeKey) via the partial unique index — a conflict is suppressed.
	DedupeKey string
}

// Enqueue inserts a job, returning its id. inserted is false when a DedupeKey
// conflict suppressed the insert (an unfinished job with that key already exists).
func Enqueue(ctx context.Context, q Querier, p EnqueueParams) (id string, inserted bool, err error) {
	maxAttempts := p.MaxAttempts
	if maxAttempts <= 0 {
		maxAttempts = DefaultMaxAttempts
	}
	var scheduledAt any
	if !p.ScheduledAt.IsZero() {
		scheduledAt = p.ScheduledAt
	}
	var dedupeKey any
	if p.DedupeKey != "" {
		dedupeKey = p.DedupeKey
	}

	const sql = `
		INSERT INTO jobs (type, payload, max_attempts, priority, scheduled_at, dedupe_key)
		VALUES ($1, $2, $3, $4, COALESCE($5, now()), $6)
		ON CONFLICT DO NOTHING
		RETURNING id`

	err = q.QueryRow(ctx, sql, p.Type, []byte(p.Payload), maxAttempts, p.Priority, scheduledAt, dedupeKey).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return id, true, nil
}

// Claim atomically selects the next due job and marks it running. It returns
// (nil, nil) when nothing is claimable. Jobs are claimed highest-priority first,
// then oldest. jobTypes restricts the claim to the given types (empty = any), so
// a worker deployment can be pinned to a subset.
//
// The SELECT ... FOR UPDATE SKIP LOCKED subquery makes concurrent workers
// contention-free: each grabs a different row, or none.
func Claim(ctx context.Context, q Querier, jobTypes []string) (*Job, error) {
	var types any
	if len(jobTypes) > 0 {
		types = jobTypes
	}

	const sql = `
		UPDATE jobs SET
			status = 'running',
			attempt = attempt + 1,
			started_at = now(),
			last_heartbeat_at = now()
		WHERE id = (
			SELECT id FROM jobs
			WHERE status = 'queued'
				AND scheduled_at <= now()
				AND ($1::text[] IS NULL OR type = ANY($1))
			ORDER BY priority DESC, scheduled_at
			FOR UPDATE SKIP LOCKED
			LIMIT 1
		)
		RETURNING id, type, payload, attempt, max_attempts`

	var job Job
	var payload []byte
	err := q.QueryRow(ctx, sql, types).Scan(&job.ID, &job.Type, &payload, &job.Attempt, &job.MaxAttempts)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	job.Payload = json.RawMessage(payload)
	return &job, nil
}

// Heartbeat marks a running job alive. It returns false when no running row
// matched — the job was cancelled (or already finished) — which the worker uses
// as the signal to abort the handler.
func Heartbeat(ctx context.Context, q Querier, id string) (alive bool, err error) {
	tag, err := q.Exec(ctx, `UPDATE jobs SET last_heartbeat_at = now() WHERE id = $1 AND status = 'running'`, id)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// Succeed records a successful outcome. The status = 'running' guard ensures a
// job cancelled mid-flight stays cancelled rather than being overwritten.
func Succeed(ctx context.Context, q Querier, id string, result map[string]any) error {
	payload, err := json.Marshal(result)
	if err != nil {
		payload = []byte(`{"error":"result not serializable"}`)
	}
	_, err = q.Exec(ctx,
		`UPDATE jobs SET status = 'succeeded', finished_at = now(), result = $2 WHERE id = $1 AND status = 'running'`,
		id, payload)
	return err
}

// Retry re-queues a failed job for another attempt at runAt (the worker computes
// the backoff). Guarded by status = 'running'.
func Retry(ctx context.Context, q Querier, id, errMsg string, runAt time.Time) error {
	_, err := q.Exec(ctx,
		`UPDATE jobs SET status = 'queued', error = $2, scheduled_at = $3 WHERE id = $1 AND status = 'running'`,
		id, errMsg, runAt)
	return err
}

// Fail records a terminal failure (attempts exhausted). Guarded by status = 'running'.
func Fail(ctx context.Context, q Querier, id, errMsg string) error {
	_, err := q.Exec(ctx,
		`UPDATE jobs SET status = 'failed', finished_at = now(), error = $2 WHERE id = $1 AND status = 'running'`,
		id, errMsg)
	return err
}

// Reap re-queues jobs whose worker died mid-flight (heartbeat older than
// reapAfter) and have attempts left, and fails those that don't. Returns how
// many were re-queued and failed. This is the safety net behind crash recovery.
func Reap(ctx context.Context, q Querier, reapAfter time.Duration) (requeued, failed int64, err error) {
	secs := reapAfter.Seconds()

	tag, err := q.Exec(ctx, `
		UPDATE jobs SET status = 'queued', scheduled_at = now(), error = 'reaped: heartbeat timeout'
		WHERE status = 'running'
			AND last_heartbeat_at < now() - make_interval(secs => $1)
			AND attempt < max_attempts`, secs)
	if err != nil {
		return 0, 0, err
	}
	requeued = tag.RowsAffected()

	tag, err = q.Exec(ctx, `
		UPDATE jobs SET status = 'failed', finished_at = now(), error = 'reaped: heartbeat timeout (attempts exhausted)'
		WHERE status = 'running'
			AND last_heartbeat_at < now() - make_interval(secs => $1)
			AND attempt >= max_attempts`, secs)
	if err != nil {
		return requeued, 0, err
	}
	failed = tag.RowsAffected()

	return requeued, failed, nil
}
