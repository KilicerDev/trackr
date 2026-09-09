CREATE TABLE "mcp_user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "mcp_guide_slug_idx";--> statement-breakpoint
ALTER TABLE "mcp_guide" ADD COLUMN "owner_user_id" text;--> statement-breakpoint
ALTER TABLE "mcp_user_settings" ADD CONSTRAINT "mcp_user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_guide" ADD CONSTRAINT "mcp_guide_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_guide_workspace_slug_idx" ON "mcp_guide" USING btree ("slug") WHERE "mcp_guide"."owner_user_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_guide_owner_slug_idx" ON "mcp_guide" USING btree ("owner_user_id","slug") WHERE "mcp_guide"."owner_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "mcp_guide_owner_idx" ON "mcp_guide" USING btree ("owner_user_id");