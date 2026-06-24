ALTER TABLE "ticket" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
-- Ticket deletion is administrational: grant only to the internal admin roles.
-- (org.superadmin also has admin.access, which overrides every check, but we
-- list the grant explicitly so it surfaces in effectivePermissions for the UI.)
INSERT INTO "role_permission" (role_id, permission) VALUES
	('org.superadmin', 'org.tickets.delete.any'),
	('org.admin', 'org.tickets.delete.any')
ON CONFLICT (role_id, permission) DO NOTHING;
