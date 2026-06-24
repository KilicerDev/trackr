-- LISTEN/NOTIFY for instant job pickup.
--
-- When a job becomes claimable (queued and due), notify the `jobs_ready`
-- channel with the job's type as the payload. The Go worker LISTENs on this
-- channel and wakes a claim slot immediately instead of waiting for its poll
-- interval. NOTIFY is transactional in Postgres, so a job enqueued inside a
-- business transaction only notifies once that transaction commits.
--
-- This is a latency optimization layered on top of polling — correctness never
-- depends on a notification being delivered. A worker that misses one (it was
-- mid-restart, the channel was dropped, a transaction-mode pooler swallowed it)
-- still picks the job up on its next poll. Backed-off retries (scheduled_at in
-- the future) deliberately do NOT notify; they are claimed when they come due,
-- which only polling can observe.
--
-- Triggers are not part of Drizzle's schema model, so this lives in a hand-
-- written migration. Note: `drizzle-kit push` will not install it — run
-- `bun run db:migrate`.

CREATE OR REPLACE FUNCTION jobs_notify_ready() RETURNS trigger
	LANGUAGE plpgsql AS $$
BEGIN
	PERFORM pg_notify('jobs_ready', NEW.type);
	RETURN NULL;
END;
$$;
--> statement-breakpoint
-- Fire on insert of a claimable job (web/scheduler enqueue of immediate work).
CREATE TRIGGER jobs_notify_ready_insert
	AFTER INSERT ON jobs
	FOR EACH ROW
	WHEN (NEW.status = 'queued' AND NEW.scheduled_at <= now())
	EXECUTE FUNCTION jobs_notify_ready();
--> statement-breakpoint
-- Fire when a job transitions INTO a claimable state (reaper re-queue, manual
-- retry, a retry whose backoff has already elapsed). The OLD.status guard keeps
-- the hot path — per-job heartbeat UPDATEs on running rows — from triggering it.
CREATE TRIGGER jobs_notify_ready_update
	AFTER UPDATE ON jobs
	FOR EACH ROW
	WHEN (
		NEW.status = 'queued'
		AND NEW.scheduled_at <= now()
		AND OLD.status IS DISTINCT FROM 'queued'
	)
	EXECUTE FUNCTION jobs_notify_ready();
