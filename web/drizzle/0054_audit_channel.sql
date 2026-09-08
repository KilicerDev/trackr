ALTER TABLE "audit_log" ADD COLUMN "channel" text;--> statement-breakpoint
CREATE INDEX "audit_log_channel_created_idx" ON "audit_log" USING btree ("channel","created_at");--> statement-breakpoint
UPDATE "audit_log" SET "channel" = CASE
	WHEN "meta"->>'via' = 'mcp' THEN 'mcp'
	WHEN "meta"->>'via' = 'api.v1' THEN 'api'
	WHEN "meta"->>'channel' = 'api' THEN 'api'
	WHEN "meta"->>'channel' IN ('web', 'chat') THEN 'web'
	ELSE NULL END
WHERE "channel" IS NULL;
