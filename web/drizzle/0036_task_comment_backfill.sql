-- Task-comment migration (data only): one thread per task, copy
-- project_activity (type='comment', task-scoped) → message with ids preserved,
-- re-key attachments, then remove the migrated comment rows from
-- project_activity (events + project-level comments stay). The activity feed
-- merges message comments with the remaining project_activity rows.
WITH nt AS (
	INSERT INTO "thread" (id, subject_type, subject_id, title, status, created_by, created_at, updated_at)
	SELECT gen_random_uuid()::text, 'task', tk.id, NULL, 'open', tk.created_by, tk.created_at, tk.updated_at
	FROM "task" tk
	RETURNING id AS thread_id, subject_id AS task_id
)
INSERT INTO "message" (id, thread_id, author_id, body, kind, internal, created_at, updated_at)
SELECT pa.id, nt.thread_id, pa.actor_id, pa.body, 'comment', false, pa.created_at, pa.updated_at
FROM "project_activity" pa
JOIN nt ON nt.task_id = pa.task_id
WHERE pa.type = 'comment' AND pa.task_id IS NOT NULL;--> statement-breakpoint
UPDATE "attachment" SET entity_type = 'message'
WHERE entity_type = 'project_activity' AND entity_id IN (SELECT id FROM "message");--> statement-breakpoint
DELETE FROM "project_activity" WHERE type = 'comment' AND task_id IS NOT NULL;
