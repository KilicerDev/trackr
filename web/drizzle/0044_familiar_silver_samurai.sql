-- Short ticket prefix per organization (SGP-22). Backfilled from the slug so
-- existing tickets keep their prefix and only lose the "-T-" infix; admins
-- shorten the key afterwards from the org settings page.
ALTER TABLE "organization" ADD COLUMN "key" text;--> statement-breakpoint
WITH derived AS (
	SELECT
		id,
		COALESCE(NULLIF(upper(regexp_replace(slug, '[^A-Za-z0-9]', '', 'g')), ''), 'ORG') AS base,
		row_number() OVER (
			PARTITION BY COALESCE(NULLIF(upper(regexp_replace(slug, '[^A-Za-z0-9]', '', 'g')), ''), 'ORG')
			ORDER BY created_at, id
		) AS rn
	FROM "organization"
)
UPDATE "organization" o
SET "key" = CASE WHEN d.rn = 1 THEN d.base ELSE d.base || d.rn END
FROM derived d
WHERE d.id = o.id;--> statement-breakpoint
ALTER TABLE "organization" ALTER COLUMN "key" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_key_idx" ON "organization" USING btree ("key");
