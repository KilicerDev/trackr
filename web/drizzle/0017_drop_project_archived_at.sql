ALTER TABLE "project" ALTER COLUMN "status" SET DEFAULT 'active';--> statement-breakpoint
-- Preserve existing archived state as the new 'archived' status before the
-- column is dropped (history will be reconstructable once the audit log lands).
UPDATE "project" SET "status" = 'archived' WHERE "archived_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "project" DROP COLUMN "archived_at";