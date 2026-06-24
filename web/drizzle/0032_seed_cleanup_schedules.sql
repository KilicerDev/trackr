-- Seed the default retention schedules so the cleanup pipeline self-activates.
--
-- Each runs daily and enqueues its job (the Go worker does the deletion). The
-- schedule's dedupe_key is carried onto each enqueued job, so a run can't pile
-- up if a previous one is still in flight.
--
-- Idempotent by job_type: a row is only inserted if one doesn't already exist,
-- so disabling or retuning a schedule later (admin → System → Schedules) sticks
-- and is never re-created by re-running migrations.

INSERT INTO schedules (job_type, payload, interval, next_run_at, dedupe_key)
SELECT 'prune.jobs', '{"olderThanDays":30}'::jsonb, '24h', now(), 'prune.jobs'
WHERE NOT EXISTS (SELECT 1 FROM schedules WHERE job_type = 'prune.jobs');
--> statement-breakpoint
INSERT INTO schedules (job_type, payload, interval, next_run_at, dedupe_key)
SELECT 'prune.invitations', '{"olderThanDays":7}'::jsonb, '24h', now(), 'prune.invitations'
WHERE NOT EXISTS (SELECT 1 FROM schedules WHERE job_type = 'prune.invitations');
--> statement-breakpoint
INSERT INTO schedules (job_type, payload, interval, next_run_at, dedupe_key)
SELECT 'prune.notifications', '{"olderThanDays":90}'::jsonb, '24h', now(), 'prune.notifications'
WHERE NOT EXISTS (SELECT 1 FROM schedules WHERE job_type = 'prune.notifications');
