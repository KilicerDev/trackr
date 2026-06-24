// Package jobworker is the reusable queue-consumer engine. A service supplies a
// map of job type → handler and calls Engine.Run; the engine owns the entire
// lifecycle — a pool of claim loops (SELECT ... FOR UPDATE SKIP LOCKED), per-job
// heartbeats, retry with backoff, crash recovery (reaper), cooperative
// cancellation, and graceful shutdown. No service reimplements that loop.
//
// It is the runtime layer on top of the jobq data layer.
package jobworker

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/KilicerDev/trackr/services/shared/jobq"
)

const (
	// How long shutdown waits for in-flight jobs before exiting. Abandoned jobs
	// are recovered by the reaper (stale heartbeat).
	shutdownGrace = 30 * time.Second
	// Outcome/heartbeat writes must survive shutdown; bound them on a detached ctx.
	writeTimeout = 10 * time.Second
	// notifyChannel is the Postgres LISTEN/NOTIFY channel the queue signals when a
	// job becomes claimable. The DB trigger that raises it lives in
	// web/drizzle/0002_notify_jobs_ready.sql.
	notifyChannel = "jobs_ready"
	// How long the listener waits before re-establishing a dropped LISTEN connection.
	listenerReconnectDelay = 2 * time.Second
)

// Handler processes one claimed job. The returned map is stored as the job's
// `result` JSON. Returning an error schedules a retry (or fails the job once
// attempts are exhausted); a panic is caught and treated as an error.
type Handler func(ctx context.Context, job jobq.Job) (map[string]any, error)

// Config tunes the engine. JobTimeout and HeartbeatInterval must be below ReapAfter.
type Config struct {
	// Number of concurrent claim loops.
	Concurrency int
	// Per-job handler timeout (handler ctx is cancelled when it elapses).
	JobTimeout time.Duration
	// How long a slot waits after an empty queue before polling again. With Notify
	// on this is the fallback: a notification wakes a slot sooner, and the poll
	// still catches delayed/retry jobs coming due and any missed notification.
	PollInterval time.Duration
	// Notify enables the LISTEN/NOTIFY listener for instant job pickup. When false
	// the engine relies on PollInterval alone (e.g. behind a transaction-mode
	// pooler that drops LISTEN/NOTIFY).
	Notify bool
	// How often a running job refreshes its heartbeat.
	HeartbeatInterval time.Duration
	// A running job whose heartbeat is older than this is re-queued (worker presumed dead).
	ReapAfter time.Duration
	// Retry backoff: scheduled_at = now() + min(BackoffBase * 2^(attempt-1), BackoffCap).
	BackoffBase time.Duration
	BackoffCap  time.Duration
	// Restrict to these job types (empty = all). Lets a deployment be pinned to a subset.
	JobTypes []string
}

// Engine drains the Postgres job queue. Build one with New, then call Run.
type Engine struct {
	pool     *pgxpool.Pool
	cfg      Config
	handlers map[string]Handler
	log      *slog.Logger
	// waker releases idle claim slots the moment a NOTIFY arrives.
	waker *waker
}

// New validates the config and returns an engine. handlers maps job type → handler.
func New(pool *pgxpool.Pool, cfg Config, handlers map[string]Handler, log *slog.Logger) (*Engine, error) {
	if cfg.Concurrency < 1 {
		return nil, fmt.Errorf("jobworker: Concurrency must be >= 1, got %d", cfg.Concurrency)
	}
	if cfg.JobTimeout >= cfg.ReapAfter {
		return nil, fmt.Errorf("jobworker: JobTimeout (%s) must be shorter than ReapAfter (%s)", cfg.JobTimeout, cfg.ReapAfter)
	}
	if cfg.HeartbeatInterval >= cfg.ReapAfter {
		return nil, fmt.Errorf("jobworker: HeartbeatInterval (%s) must be shorter than ReapAfter (%s)", cfg.HeartbeatInterval, cfg.ReapAfter)
	}
	if log == nil {
		log = slog.Default()
	}
	return &Engine{pool: pool, cfg: cfg, handlers: handlers, log: log, waker: newWaker()}, nil
}

// Run starts the claim pool + reaper and blocks until ctx is cancelled, then
// drains in-flight jobs (grace period) and returns.
func (e *Engine) Run(ctx context.Context) error {
	e.log.Info("worker engine started",
		"concurrency", e.cfg.Concurrency, "jobTypes", e.cfg.JobTypes, "notify", e.cfg.Notify)

	var wg sync.WaitGroup

	wg.Add(1)
	go func() {
		defer wg.Done()
		e.runReaper(ctx)
	}()

	if e.cfg.Notify {
		wg.Add(1)
		go func() {
			defer wg.Done()
			e.runListener(ctx)
		}()
	}

	for i := 0; i < e.cfg.Concurrency; i++ {
		wg.Add(1)
		go func(slot int) {
			defer wg.Done()
			e.runLoop(ctx, slot)
		}(i)
	}

	<-ctx.Done()
	e.log.Info("shutting down, waiting for in-flight jobs", "grace", shutdownGrace)

	done := make(chan struct{})
	go func() { wg.Wait(); close(done) }()
	select {
	case <-done:
		e.log.Info("shutdown complete")
	case <-time.After(shutdownGrace):
		e.log.Warn("shutdown grace expired; abandoning in-flight jobs to the reaper")
	}
	return nil
}

// runLoop is one claim slot: claim the next due job, process it, repeat. When the
// queue is empty it waits for a NOTIFY (or the poll interval) before retrying, so
// a slot picks up newly-enqueued work the instant it lands instead of on the next
// poll. A slot draining a backlog claims back-to-back and never waits.
func (e *Engine) runLoop(ctx context.Context, slot int) {
	log := e.log.With("slot", slot)
	for {
		if ctx.Err() != nil {
			return
		}

		// Arm the wake signal BEFORE claiming, so a notification that lands after
		// our claim comes up empty — but before we start waiting — still wakes us
		// rather than being lost to the gap.
		wake := e.waker.wait()

		job, err := jobq.Claim(ctx, e.pool, e.cfg.JobTypes)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Warn("claim failed, backing off", "error", err)
			e.waitForWork(ctx, wake)
			continue
		}
		if job == nil {
			e.waitForWork(ctx, wake) // empty queue
			continue
		}

		e.process(ctx, log, *job)
	}
}

// waitForWork blocks an idle slot until there may be work again: a notification
// arrived, the poll interval elapsed (the fallback that also catches delayed and
// retried jobs coming due), or the engine is shutting down.
func (e *Engine) waitForWork(ctx context.Context, wake <-chan struct{}) {
	select {
	case <-ctx.Done():
	case <-wake:
	case <-time.After(e.cfg.PollInterval):
	}
}

// process runs the handler for one claimed job and records the outcome. The
// handler runs on a context detached from shutdown (in-flight jobs may finish
// during the grace period) but bounded by JobTimeout, and is cancelled early if
// the job is cancelled (observed via the heartbeat). Outcome writes are guarded
// by `status = 'running'`, so a cancelled job is never overwritten.
func (e *Engine) process(ctx context.Context, log *slog.Logger, job jobq.Job) {
	log = log.With("jobId", job.ID, "type", job.Type, "attempt", job.Attempt)

	handler, ok := e.handlers[job.Type]
	if !ok {
		log.Error("no handler registered for job type; failing job")
		e.record(ctx, log, func(rctx context.Context) error {
			return jobq.Fail(rctx, e.pool, job.ID, fmt.Sprintf("no handler registered for type %q", job.Type))
		})
		return
	}

	jobCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), e.cfg.JobTimeout)
	defer cancel()

	var cancelled atomic.Bool
	hbDone := make(chan struct{})
	go e.heartbeat(jobCtx, cancel, log, job.ID, hbDone, &cancelled)

	started := time.Now()
	result, err := runHandler(jobCtx, handler, job)
	close(hbDone)
	elapsed := time.Since(started)

	if cancelled.Load() {
		log.Info("job cancelled", "elapsed", elapsed)
		return // row is already 'cancelled'; nothing to record
	}

	if err == nil {
		log.Info("job succeeded", "elapsed", elapsed)
		e.record(ctx, log, func(rctx context.Context) error {
			return jobq.Succeed(rctx, e.pool, job.ID, result)
		})
		return
	}

	if job.Attempt >= job.MaxAttempts {
		log.Error("job failed permanently, attempts exhausted", "error", err, "elapsed", elapsed)
		e.record(ctx, log, func(rctx context.Context) error {
			return jobq.Fail(rctx, e.pool, job.ID, err.Error())
		})
		return
	}

	backoff := e.computeBackoff(job.Attempt)
	runAt := time.Now().Add(backoff)
	log.Warn("job failed, will retry", "error", err, "elapsed", elapsed, "retryIn", backoff)
	e.record(ctx, log, func(rctx context.Context) error {
		return jobq.Retry(rctx, e.pool, job.ID, err.Error(), runAt)
	})
}

// heartbeat refreshes last_heartbeat_at on a ticker. When a heartbeat finds the
// job is no longer 'running' (cancelled, or finished elsewhere), it cancels the
// handler's context and flags it so process leaves the terminal status intact.
func (e *Engine) heartbeat(
	ctx context.Context,
	cancel context.CancelFunc,
	log *slog.Logger,
	id string,
	done <-chan struct{},
	cancelled *atomic.Bool,
) {
	ticker := time.NewTicker(e.cfg.HeartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-done:
			return
		case <-ctx.Done():
			return
		case <-ticker.C:
			alive, err := jobq.Heartbeat(ctx, e.pool, id)
			if err != nil {
				if ctx.Err() == nil {
					log.Warn("heartbeat failed", "error", err)
				}
				continue
			}
			if !alive {
				log.Info("job cancelled; aborting handler")
				cancelled.Store(true)
				cancel()
				return
			}
		}
	}
}

// runReaper periodically re-queues jobs whose worker died mid-flight.
func (e *Engine) runReaper(ctx context.Context) {
	ticker := time.NewTicker(e.cfg.ReapAfter / 2)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			requeued, failed, err := jobq.Reap(ctx, e.pool, e.cfg.ReapAfter)
			if err != nil {
				if ctx.Err() == nil {
					e.log.Warn("reap failed", "error", err)
				}
				continue
			}
			if requeued > 0 || failed > 0 {
				e.log.Info("reaped stale jobs", "requeued", requeued, "failed", failed)
			}
		}
	}
}

// runListener holds a dedicated connection that LISTENs on the queue's NOTIFY
// channel and wakes claim slots the instant a job becomes claimable. It is a
// latency optimization on top of polling, not a correctness requirement: if the
// connection drops it reconnects (and meanwhile the poll interval keeps the queue
// draining), so a missed notification only ever costs one poll interval.
func (e *Engine) runListener(ctx context.Context) {
	for {
		if ctx.Err() != nil {
			return
		}
		if err := e.listenOnce(ctx); err != nil && ctx.Err() == nil {
			e.log.Warn("notify listener disconnected, reconnecting", "error", err)
		}
		sleep(ctx, listenerReconnectDelay)
	}
}

// listenOnce opens a fresh listener connection (cloned from the pool's config),
// LISTENs, and forwards notifications until the connection drops or ctx is done.
func (e *Engine) listenOnce(ctx context.Context) error {
	conn, err := pgx.ConnectConfig(ctx, e.pool.Config().ConnConfig)
	if err != nil {
		return err
	}
	defer conn.Close(context.Background())

	if _, err := conn.Exec(ctx, "LISTEN "+notifyChannel); err != nil {
		return err
	}
	e.log.Info("listening for job notifications", "channel", notifyChannel)

	// Notifications sent before this LISTEN took effect (between a slot's last
	// empty claim and now, or while we were reconnecting) are missed by design.
	// Wake every slot once so none waits a full poll interval on startup/reconnect.
	e.waker.wake()

	for {
		n, err := conn.WaitForNotification(ctx)
		if err != nil {
			return err
		}
		if e.shouldWake(n.Payload) {
			e.waker.wake()
		}
	}
}

// shouldWake filters notifications by job type for a type-pinned worker, so a
// deployment restricted to a subset (e.g. a GPU box on "video.transcode") isn't
// woken by unrelated jobs. An unset filter (or an empty payload) always wakes.
func (e *Engine) shouldWake(jobType string) bool {
	if len(e.cfg.JobTypes) == 0 || jobType == "" {
		return true
	}
	for _, t := range e.cfg.JobTypes {
		if t == jobType {
			return true
		}
	}
	return false
}

// computeBackoff returns min(BackoffBase * 2^(attempt-1), BackoffCap).
func (e *Engine) computeBackoff(attempt int) time.Duration {
	d := e.cfg.BackoffBase
	for i := 1; i < attempt; i++ {
		d *= 2
		if d >= e.cfg.BackoffCap {
			return e.cfg.BackoffCap
		}
	}
	if d > e.cfg.BackoffCap {
		return e.cfg.BackoffCap
	}
	return d
}

// record writes a job outcome on a detached, time-boxed context so it survives shutdown.
func (e *Engine) record(ctx context.Context, log *slog.Logger, write func(context.Context) error) {
	rctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), writeTimeout)
	defer cancel()
	if err := write(rctx); err != nil && !errors.Is(err, context.Canceled) {
		log.Error("failed to record job outcome", "error", err)
	}
}

// runHandler invokes the handler, converting panics into errors so one bad job
// cannot take the worker down.
func runHandler(ctx context.Context, handler Handler, job jobq.Job) (result map[string]any, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("handler panicked: %v", r)
		}
	}()
	return handler(ctx, job)
}

func sleep(ctx context.Context, d time.Duration) {
	select {
	case <-ctx.Done():
	case <-time.After(d):
	}
}

// waker is a broadcast latch: wake() releases every goroutine currently waiting
// on the channel returned by wait(), then arms a fresh one. It coalesces a burst
// of notifications into a single "there may be work" signal without buffering or
// dropping wakeups — the close-and-replace is what lets one NOTIFY release all
// idle slots at once.
type waker struct {
	mu sync.Mutex
	ch chan struct{}
}

func newWaker() *waker {
	return &waker{ch: make(chan struct{})}
}

// wait returns a channel closed by the next wake(). Capture it before the work
// check you intend to retry, so a wake racing that check is not lost.
func (w *waker) wait() <-chan struct{} {
	w.mu.Lock()
	ch := w.ch
	w.mu.Unlock()
	return ch
}

func (w *waker) wake() {
	w.mu.Lock()
	close(w.ch)
	w.ch = make(chan struct{})
	w.mu.Unlock()
}
