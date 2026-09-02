CREATE TABLE "webhook_delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"event_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp,
	"last_status_code" integer,
	"last_error" text,
	"last_duration_ms" integer,
	"response_snippet" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_delivery_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"delivery_id" text NOT NULL,
	"attempt" integer NOT NULL,
	"status_code" integer,
	"error" text,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"request_headers" jsonb,
	"response_snippet" text,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_event" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"org_id" text,
	"project_id" text,
	"actor_id" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"secret" text NOT NULL,
	"event_types" jsonb NOT NULL,
	"org_ids" jsonb,
	"project_ids" jsonb,
	"assignee_user_id" text,
	"include_internal_messages" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"disabled_reason" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_success_at" timestamp,
	"last_failure_at" timestamp,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_subscription_id_webhook_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."webhook_subscription"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_event_id_webhook_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."webhook_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery_attempt" ADD CONSTRAINT "webhook_delivery_attempt_delivery_id_webhook_delivery_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."webhook_delivery"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_subscription" ADD CONSTRAINT "webhook_subscription_assignee_user_id_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_subscription" ADD CONSTRAINT "webhook_subscription_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhook_delivery_sub_created_idx" ON "webhook_delivery" USING btree ("subscription_id","created_at");--> statement-breakpoint
CREATE INDEX "webhook_delivery_status_next_idx" ON "webhook_delivery" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "webhook_delivery_event_idx" ON "webhook_delivery" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "webhook_delivery_attempt_delivery_idx" ON "webhook_delivery_attempt" USING btree ("delivery_id","attempt");--> statement-breakpoint
CREATE INDEX "webhook_event_created_idx" ON "webhook_event" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "webhook_subscription_enabled_idx" ON "webhook_subscription" USING btree ("enabled");