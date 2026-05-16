CREATE TABLE "user_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"theme" text DEFAULT 'dark' NOT NULL,
	"accent" text DEFAULT '#ef7a6d' NOT NULL,
	"density" text DEFAULT 'comfortable' NOT NULL,
	"default_landing" text DEFAULT '/week' NOT NULL,
	"week_starts_on" integer DEFAULT 1 NOT NULL,
	"notifications" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"view_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;