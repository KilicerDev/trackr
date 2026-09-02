-- Retention for outbound webhook history: `webhook_event` rows (and their
-- deliveries/attempts via cascade) older than 30 days are deleted daily by the
-- Go worker's `prune.webhook_deliveries` handler. Idempotent by job_type, same
-- as 0032_seed_cleanup_schedules.sql.

INSERT INTO schedules (job_type, payload, interval, next_run_at, dedupe_key)
SELECT 'prune.webhook_deliveries', '{"olderThanDays":30}'::jsonb, '24h', now(), 'prune.webhook_deliveries'
WHERE NOT EXISTS (SELECT 1 FROM schedules WHERE job_type = 'prune.webhook_deliveries');
