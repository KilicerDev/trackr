CREATE TABLE "note" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text DEFAULT 'quick' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"icon" text DEFAULT 'file-text' NOT NULL,
	"document_id" text,
	"owner_id" text,
	"updated_by_id" text,
	"pinned" boolean DEFAULT false NOT NULL,
	"meeting_date" timestamp,
	"project_id" text,
	"task_id" text,
	"template_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_access" (
	"id" text PRIMARY KEY NOT NULL,
	"note_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'read' NOT NULL,
	"granted_via" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_share_link" (
	"id" text PRIMARY KEY NOT NULL,
	"note_id" text NOT NULL,
	"token" text NOT NULL,
	"role" text DEFAULT 'read' NOT NULL,
	"created_by_id" text,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "note_share_link_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "note_template" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"icon" text DEFAULT 'file-text' NOT NULL,
	"owner_id" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"body_html" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_template_id_note_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."note_template"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_access" ADD CONSTRAINT "note_access_note_id_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_access" ADD CONSTRAINT "note_access_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_access" ADD CONSTRAINT "note_access_granted_via_note_share_link_id_fk" FOREIGN KEY ("granted_via") REFERENCES "public"."note_share_link"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_share_link" ADD CONSTRAINT "note_share_link_note_id_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_share_link" ADD CONSTRAINT "note_share_link_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_template" ADD CONSTRAINT "note_template_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_owner_idx" ON "note" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "note_kind_date_idx" ON "note" USING btree ("kind","meeting_date");--> statement-breakpoint
CREATE UNIQUE INDEX "note_access_note_user_idx" ON "note_access" USING btree ("note_id","user_id");