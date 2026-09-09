-- Superadmin tier (TRACKR-13): `admin.settings.manage` (branding, webhooks,
-- API keys, MCP guidance, devices) and the new `admin.system.manage` (job
-- queue, schedules) are superadmin-only. `can()` no longer lets the
-- `admin.access` override reach them (SUPERADMIN_ONLY_PERMISSIONS), so the
-- explicit org.admin grant is the only thing still opening the door — drop it.
DELETE FROM "role_permission" WHERE role_id = 'org.admin' AND permission = 'admin.settings.manage';--> statement-breakpoint
INSERT INTO "role_permission" (role_id, permission) VALUES
	('org.superadmin', 'admin.system.manage')
ON CONFLICT (role_id, permission) DO NOTHING;--> statement-breakpoint
UPDATE "role" SET description = 'Full access across the entire workspace: settings, integrations, the system section and role management.' WHERE id = 'org.superadmin';--> statement-breakpoint
UPDATE "role" SET description = 'Full operational access. Manages users, organizations, templates and all projects.' WHERE id = 'org.admin';
