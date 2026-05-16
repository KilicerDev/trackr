CREATE TABLE "role" (
	"id" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"color" text,
	"builtin" boolean DEFAULT false NOT NULL,
	"internal_only" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permission" (
	"role_id" text NOT NULL,
	"permission" text NOT NULL,
	CONSTRAINT "role_permission_role_id_permission_pk" PRIMARY KEY("role_id","permission")
);
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "is_internal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "role_scope_idx" ON "role" USING btree ("scope","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_internal_unique" ON "organization" USING btree ("is_internal") WHERE "organization"."is_internal" = true;--> statement-breakpoint

-- ─── Seed: built-in roles ────────────────────────────────────────────────
INSERT INTO "role" (id, scope, label, description, color, builtin, internal_only, sort_order) VALUES
	('org.superadmin',  'org',     'Superadmin', 'Full access across the entire workspace, including role management.', '#ef7a6d', true, true,  10),
	('org.admin',       'org',     'Admin',      'Full operational access. Manages users, orgs, settings, and all projects.', '#c08bd6', true, true,  20),
	('org.staff',       'org',     'Staff',      'Internal team member. Cross-org ticket visibility; works on assigned projects.', '#7a9cf0', true, true,  30),
	('org.client',      'org',     'Client',     'External org member with full visibility over their org''s tickets.', '#7fc8a9', true, false, 40),
	('org.member',      'org',     'Member',     'External org member. Can create and manage only their own tickets.', '#8fb6c4', true, false, 50),
	('project.manager', 'project', 'Manager',    'Manages this project — full edits to tasks and member roster.', '#ef7a6d', true, false, 10),
	('project.member',  'project', 'Member',     'Contributes tasks to this project; edits their own.', '#7a9cf0', true, false, 20),
	('project.viewer',  'project', 'Viewer',     'Read-only access to this project''s tasks.', '#9aa4b2', true, false, 30);
--> statement-breakpoint

-- ─── Seed: permission matrix ────────────────────────────────────────────
INSERT INTO "role_permission" (role_id, permission) VALUES
	-- org.superadmin: every permission.
	('org.superadmin', 'admin.access'),
	('org.superadmin', 'admin.users.manage'),
	('org.superadmin', 'admin.roles.manage'),
	('org.superadmin', 'admin.orgs.manage'),
	('org.superadmin', 'admin.settings.manage'),
	('org.superadmin', 'admin.logs.view'),
	('org.superadmin', 'org.tickets.create'),
	('org.superadmin', 'org.tickets.read.own'),
	('org.superadmin', 'org.tickets.read.any'),
	('org.superadmin', 'org.tickets.edit.own'),
	('org.superadmin', 'org.tickets.edit.any'),
	('org.superadmin', 'org.tickets.comment'),
	('org.superadmin', 'org.members.manage'),
	('org.superadmin', 'project.tasks.create'),
	('org.superadmin', 'project.tasks.read'),
	('org.superadmin', 'project.tasks.edit.own'),
	('org.superadmin', 'project.tasks.edit.any'),
	('org.superadmin', 'project.tasks.delete.any'),
	('org.superadmin', 'project.tasks.comment'),
	('org.superadmin', 'project.tasks.assign'),
	('org.superadmin', 'project.edit'),
	('org.superadmin', 'project.archive'),
	('org.superadmin', 'project.members.manage'),
	-- org.admin: everything except admin.roles.manage.
	('org.admin', 'admin.access'),
	('org.admin', 'admin.users.manage'),
	('org.admin', 'admin.orgs.manage'),
	('org.admin', 'admin.settings.manage'),
	('org.admin', 'admin.logs.view'),
	('org.admin', 'org.tickets.create'),
	('org.admin', 'org.tickets.read.own'),
	('org.admin', 'org.tickets.read.any'),
	('org.admin', 'org.tickets.edit.own'),
	('org.admin', 'org.tickets.edit.any'),
	('org.admin', 'org.tickets.comment'),
	('org.admin', 'org.members.manage'),
	('org.admin', 'project.tasks.create'),
	('org.admin', 'project.tasks.read'),
	('org.admin', 'project.tasks.edit.own'),
	('org.admin', 'project.tasks.edit.any'),
	('org.admin', 'project.tasks.delete.any'),
	('org.admin', 'project.tasks.comment'),
	('org.admin', 'project.tasks.assign'),
	('org.admin', 'project.edit'),
	('org.admin', 'project.archive'),
	('org.admin', 'project.members.manage'),
	-- org.staff: no admin section; cross-org ticket read; project work.
	('org.staff', 'org.tickets.read.any'),
	('org.staff', 'org.tickets.comment'),
	('org.staff', 'project.tasks.create'),
	('org.staff', 'project.tasks.read'),
	('org.staff', 'project.tasks.edit.own'),
	('org.staff', 'project.tasks.comment'),
	('org.staff', 'project.tasks.assign'),
	-- org.client: external client with full ticket visibility for their org.
	('org.client', 'org.tickets.create'),
	('org.client', 'org.tickets.read.any'),
	('org.client', 'org.tickets.edit.own'),
	('org.client', 'org.tickets.comment'),
	-- org.member: external user, only their own tickets in this org.
	('org.member', 'org.tickets.create'),
	('org.member', 'org.tickets.read.own'),
	('org.member', 'org.tickets.edit.own'),
	('org.member', 'org.tickets.comment'),
	-- project.manager: full project authority.
	('project.manager', 'project.tasks.create'),
	('project.manager', 'project.tasks.read'),
	('project.manager', 'project.tasks.edit.own'),
	('project.manager', 'project.tasks.edit.any'),
	('project.manager', 'project.tasks.delete.any'),
	('project.manager', 'project.tasks.comment'),
	('project.manager', 'project.tasks.assign'),
	('project.manager', 'project.edit'),
	('project.manager', 'project.archive'),
	('project.manager', 'project.members.manage'),
	-- project.member: contributes; edits own.
	('project.member', 'project.tasks.create'),
	('project.member', 'project.tasks.read'),
	('project.member', 'project.tasks.edit.own'),
	('project.member', 'project.tasks.comment'),
	('project.member', 'project.tasks.assign'),
	-- project.viewer: read-only.
	('project.viewer', 'project.tasks.read');
--> statement-breakpoint

-- ─── Seed: the internal "Trackr" organization ───────────────────────────
INSERT INTO "organization" (id, slug, name, description, color, is_internal)
VALUES ('org_trackr_internal', 'trackr', 'Trackr', 'Internal workspace for the Trackr team. Members of this org are the only users with access to /admin.', '#ef7a6d', true)
ON CONFLICT (id) DO NOTHING;
