-- Remap legacy role strings on existing memberships to the new role IDs
-- seeded in 0008. Also adds a `project.create` permission and grants it to
-- the Trackr internal roles, so creating projects can be gated by `can()`.

-- ─── organization_member: legacy → new IDs ───────────────────────────────
-- Internal Trackr org: owner→superadmin, admin→admin, anything else→staff.
UPDATE "organization_member" AS m
SET "role" = CASE m."role"
	WHEN 'owner'  THEN 'org.superadmin'
	WHEN 'admin'  THEN 'org.admin'
	ELSE 'org.staff'
END
FROM "organization" AS o
WHERE m."org_id" = o."id"
	AND o."is_internal" = true
	AND m."role" NOT LIKE 'org.%';
--> statement-breakpoint

-- Client orgs: owner/admin → client (full visibility), member → member.
UPDATE "organization_member" AS m
SET "role" = CASE m."role"
	WHEN 'owner'  THEN 'org.client'
	WHEN 'admin'  THEN 'org.client'
	WHEN 'member' THEN 'org.member'
	ELSE 'org.member'
END
FROM "organization" AS o
WHERE m."org_id" = o."id"
	AND o."is_internal" = false
	AND m."role" NOT LIKE 'org.%';
--> statement-breakpoint

-- ─── project_member: legacy → new IDs ────────────────────────────────────
UPDATE "project_member"
SET "role" = CASE "role"
	WHEN 'owner'   THEN 'project.manager'
	WHEN 'admin'   THEN 'project.manager'
	WHEN 'lead'    THEN 'project.manager'
	WHEN 'manager' THEN 'project.manager'
	WHEN 'viewer'  THEN 'project.viewer'
	ELSE 'project.member'
END
WHERE "role" NOT LIKE 'project.%';
--> statement-breakpoint

-- ─── New permission: project.create ──────────────────────────────────────
-- Grant to Trackr-team roles only. Clients/project-scope roles never create
-- new projects.
INSERT INTO "role_permission" (role_id, permission) VALUES
	('org.superadmin', 'project.create'),
	('org.admin',      'project.create'),
	('org.staff',      'project.create')
ON CONFLICT (role_id, permission) DO NOTHING;
