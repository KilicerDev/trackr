-- Backfill the project activity feed from existing data before dropping
-- task_comment. Comments keep their original id/timestamps; time logs and task
-- creations are reconstructed from the rows we still have. Field-change history
-- (status/priority/etc.) can't be recovered and starts empty.

-- Comments → activity rows (reuse the comment id as the activity id).
INSERT INTO "project_activity" ("id", "project_id", "task_id", "actor_id", "type", "body", "created_at", "updated_at")
SELECT tc."id", t."project_id", tc."task_id", tc."author_id", 'comment', tc."body", tc."created_at", tc."updated_at"
FROM "task_comment" tc
JOIN "task" t ON t."id" = tc."task_id";--> statement-breakpoint

-- Time logs → 'time.logged' rows.
INSERT INTO "project_activity" ("id", "project_id", "task_id", "actor_id", "type", "meta", "created_at", "updated_at")
SELECT ttl."id", t."project_id", ttl."task_id", ttl."user_id", 'time.logged',
	jsonb_build_object(
		'minutes', ttl."minutes",
		'note', ttl."note",
		'loggedAt', ttl."logged_at",
		'taskRef', p."key" || '-' || t."number",
		'taskTitle', t."title"
	),
	ttl."created_at", ttl."created_at"
FROM "task_time_log" ttl
JOIN "task" t ON t."id" = ttl."task_id"
JOIN "project" p ON p."id" = t."project_id";--> statement-breakpoint

-- Task creation → 'task.created' rows (reuse the task id as the activity id).
INSERT INTO "project_activity" ("id", "project_id", "task_id", "actor_id", "type", "meta", "created_at", "updated_at")
SELECT t."id", t."project_id", t."id", t."created_by", 'task.created',
	jsonb_build_object('taskRef', p."key" || '-' || t."number", 'taskTitle', t."title"),
	t."created_at", t."created_at"
FROM "task" t
JOIN "project" p ON p."id" = t."project_id";--> statement-breakpoint

DROP TABLE "task_comment" CASCADE;
