CREATE TABLE "task_recurrence" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"created_by" text,
	"origin" text,
	"title" text NOT NULL,
	"description" text,
	"priority" text DEFAULT 'none' NOT NULL,
	"type" text DEFAULT 'task' NOT NULL,
	"estimate_minutes" integer,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assignee_ids" text[] DEFAULT '{}' NOT NULL,
	"due_offset_days" integer,
	"rule" jsonb NOT NULL,
	"time" text DEFAULT '09:00' NOT NULL,
	"timezone" text DEFAULT 'Europe/Berlin' NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_task_id" text,
	"paused_at" timestamp with time zone,
	"paused_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "internal_secret" (
	"name" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "recurrence_id" text;--> statement-breakpoint
ALTER TABLE "task_recurrence" ADD CONSTRAINT "task_recurrence_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_recurrence" ADD CONSTRAINT "task_recurrence_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_recurrence" ADD CONSTRAINT "task_recurrence_last_task_id_task_id_fk" FOREIGN KEY ("last_task_id") REFERENCES "public"."task"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_recurrence_due_idx" ON "task_recurrence" USING btree ("next_run_at") WHERE paused_at is null;--> statement-breakpoint
CREATE INDEX "task_recurrence_project_idx" ON "task_recurrence" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_recurrence_id_task_recurrence_id_fk" FOREIGN KEY ("recurrence_id") REFERENCES "public"."task_recurrence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_recurrence_idx" ON "task" USING btree ("recurrence_id");--> statement-breakpoint
-- Worker → web shared secret for /api/internal/* (no env var to configure).
-- 244 random bits from two v4 UUIDs; idempotent so a re-run never rotates it.
INSERT INTO "internal_secret" ("name", "value")
SELECT 'worker', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
WHERE NOT EXISTS (SELECT 1 FROM "internal_secret" WHERE "name" = 'worker');
--> statement-breakpoint
-- Recurring tasks: check for due series every 5 minutes. Idempotent by
-- job_type, so retuning or pausing it under Admin → System → Schedules sticks.
INSERT INTO schedules (job_type, payload, interval, next_run_at, dedupe_key)
SELECT 'tasks.recur', '{}'::jsonb, '5m', now(), 'tasks.recur'
WHERE NOT EXISTS (SELECT 1 FROM schedules WHERE job_type = 'tasks.recur');
