-- New client-org role: org.agent — a "privileged member". It has the same
-- full ticket visibility as org.client (read.any + chat) but, unlike the
-- client, can edit/assign every ticket in its org (org.tickets.edit.any).
-- Deletion stays admin-only, so it is deliberately NOT granted here.
INSERT INTO "role" (id, scope, label, description, color, builtin, internal_only, sort_order) VALUES
	('org.agent', 'org', 'Agent', 'External org member with full ticket visibility who can edit and assign every ticket in their org.', '#e0a35c', true, false, 45)
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permission" (role_id, permission) VALUES
	('org.agent', 'org.tickets.create'),
	('org.agent', 'org.tickets.read.any'),
	('org.agent', 'org.tickets.edit.own'),
	('org.agent', 'org.tickets.edit.any'),
	('org.agent', 'org.tickets.comment'),
	('org.agent', 'org.chat.read'),
	('org.agent', 'org.chat.post')
ON CONFLICT (role_id, permission) DO NOTHING;
