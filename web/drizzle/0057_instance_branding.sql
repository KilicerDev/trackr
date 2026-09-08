CREATE TABLE "instance_branding" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT 'Trackr' NOT NULL,
	"logo_mime" text,
	"logo_data" "bytea",
	"logo_version" text,
	"updated_by_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "instance_branding" ADD CONSTRAINT "instance_branding_updated_by_id_user_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;