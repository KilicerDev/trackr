CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"kind" text NOT NULL,
	"actor_id" text,
	"actor_label" text,
	"target_type" text,
	"target_id" text,
	"target_label" text,
	"org_id" text,
	"ip_address" text,
	"user_agent" text,
	"meta" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_kind_created_idx" ON "audit_log" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_type_idx" ON "audit_log" USING btree ("type");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id");