CREATE TABLE "notification_digest_item" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"org_id" text,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "quiet_hours" jsonb DEFAULT '{"enabled":false,"start":"20:00","end":"08:00","weekends":true}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "digest" jsonb DEFAULT '{"frequency":"daily","hour":9}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_digest_item" ADD CONSTRAINT "notification_digest_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_digest_item" ADD CONSTRAINT "notification_digest_item_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notif_digest_pending_idx" ON "notification_digest_item" USING btree ("user_id","created_at") WHERE sent_at is null;--> statement-breakpoint
-- Seed the digest-flush schedule. Runs every 15 minutes; the Go `notify.digest`
-- handler decides per user whether their hourly/daily window is due. Idempotent
-- by job_type so retuning/disabling it later (admin → Schedules) sticks.
INSERT INTO schedules (job_type, payload, interval, next_run_at, dedupe_key)
SELECT 'notify.digest', '{}'::jsonb, '15m', now(), 'notify.digest'
WHERE NOT EXISTS (SELECT 1 FROM schedules WHERE job_type = 'notify.digest');