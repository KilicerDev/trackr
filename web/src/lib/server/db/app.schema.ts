import { relations, sql } from 'drizzle-orm';
import {
	pgTable,
	text,
	integer,
	timestamp,
	date,
	boolean,
	jsonb,
	index,
	uniqueIndex,
	primaryKey,
	customType,
	type AnyPgColumn
} from 'drizzle-orm/pg-core';
import { user } from './auth.schema';
import type { AttachmentEntityType } from '$lib/config/attachments';

export const invitation = pgTable(
	'invitation',
	{
		id: text('id').primaryKey(),
		email: text('email').notNull().unique(),
		name: text('name').notNull(),
		// `role` is the derived better-auth user.role (user/admin/superadmin),
		// kept for impersonation + admin-UI visibility. `orgId`/`orgRole` are the
		// org membership the invitee receives on accept — the source of truth for
		// the permission engine. Older invitations may have null org fields.
		role: text('role').notNull().default('user'),
		orgId: text('org_id').references(() => organization.id, { onDelete: 'set null' }),
		orgRole: text('org_role'),
		token: text('token').notNull().unique(),
		invitedBy: text('invited_by').references(() => user.id, { onDelete: 'set null' }),
		expiresAt: timestamp('expires_at').notNull(),
		acceptedAt: timestamp('accepted_at'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull()
	},
	(table) => [index('invitation_token_idx').on(table.token)]
);

export const invitationRelations = relations(invitation, ({ one }) => ({
	inviter: one(user, {
		fields: [invitation.invitedBy],
		references: [user.id]
	})
}));

export type Invitation = typeof invitation.$inferSelect;

// ─── Organizations ─────────────────────────────────────────────────────────
// A row represents a *client* (Siweb GmbH, Maja, …). Internal projects have
// `project.org_id IS NULL` — there is no synthetic "Trackr" org row.

export const organization = pgTable(
	'organization',
	{
		id: text('id').primaryKey(),
		slug: text('slug').notNull(),
		// Short uppercase prefix used for ticket numbering (SGP-22). Never stored on
		// the ticket itself — display ids are rendered from key + ticket.number, so
		// changing the key re-labels every existing ticket at once.
		key: text('key').notNull(),
		name: text('name').notNull(),
		description: text('description'),
		color: text('color').notNull().default('#7a9cf0'),
		// Exactly one org has this flag set — the internal "Trackr" org whose
		// admin/superadmin members are the only users with /admin access.
		// Enforced by a partial unique index `organization_internal_unique`.
		isInternal: boolean('is_internal').notNull().default(false),
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		nextTicketNumber: integer('next_ticket_number').notNull().default(1),
		archivedAt: timestamp('archived_at'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull()
	},
	(t) => [
		uniqueIndex('organization_slug_idx').on(t.slug),
		uniqueIndex('organization_key_idx').on(t.key),
		uniqueIndex('organization_internal_unique')
			.on(t.isInternal)
			.where(sql`${t.isInternal} = true`)
	]
);

export type Organization = typeof organization.$inferSelect;

// ─── Projects ──────────────────────────────────────────────────────────────
// `key` is the short uppercase prefix used for ticket numbering (TRACKR-12).
// `org_id` is nullable: NULL ⇒ internal work, non-NULL ⇒ work for that client.

export const project = pgTable(
	'project',
	{
		id: text('id').primaryKey(),
		key: text('key').notNull(),
		name: text('name').notNull(),
		description: text('description'),
		color: text('color').notNull().default('#7a9cf0'),
		icon: text('icon').notNull().default('P'),
		status: text('status').notNull().default('active'),
		// Free-form tags, same shape as task/ticket tags (normalised strings).
		tags: text('tags').array().notNull().default([]),
		orgId: text('org_id').references(() => organization.id, { onDelete: 'set null' }),
		leadId: text('lead_id').references(() => user.id, { onDelete: 'set null' }),
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		nextTaskNumber: integer('next_task_number').notNull().default(1),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull()
	},
	(t) => [
		uniqueIndex('project_key_idx').on(t.key),
		index('project_org_idx').on(t.orgId),
		index('project_lead_idx').on(t.leadId)
	]
);

export type Project = typeof project.$inferSelect;

// ─── Project members ───────────────────────────────────────────────────────
// Explicit membership separate from task assignment so non-assignees can
// still see/participate in a project.

export const projectMember = pgTable(
	'project_member',
	{
		projectId: text('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		role: text('role').notNull().default('member'),
		addedAt: timestamp('added_at').defaultNow().notNull()
	},
	(t) => [
		primaryKey({ columns: [t.projectId, t.userId] }),
		index('project_member_user_idx').on(t.userId)
	]
);

export type ProjectMember = typeof projectMember.$inferSelect;

// ─── Organization members ──────────────────────────────────────────────────
// Mirrors `project_member`. Independent of project membership — an org admin
// might oversee every project in the org without being a member of any one.

export const organizationMember = pgTable(
	'organization_member',
	{
		orgId: text('org_id')
			.notNull()
			.references(() => organization.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		role: text('role').notNull().default('member'),
		addedAt: timestamp('added_at').defaultNow().notNull()
	},
	(t) => [
		primaryKey({ columns: [t.orgId, t.userId] }),
		index('organization_member_user_idx').on(t.userId)
	]
);

export type OrganizationMember = typeof organizationMember.$inferSelect;

export const organizationMemberRelations = relations(organizationMember, ({ one }) => ({
	org: one(organization, {
		fields: [organizationMember.orgId],
		references: [organization.id]
	}),
	user: one(user, {
		fields: [organizationMember.userId],
		references: [user.id]
	})
}));

export const organizationRelations = relations(organization, ({ one, many }) => ({
	creator: one(user, {
		fields: [organization.createdBy],
		references: [user.id]
	}),
	projects: many(project),
	members: many(organizationMember)
}));

export const projectRelations = relations(project, ({ one, many }) => ({
	org: one(organization, {
		fields: [project.orgId],
		references: [organization.id]
	}),
	lead: one(user, {
		fields: [project.leadId],
		references: [user.id],
		relationName: 'project_lead'
	}),
	creator: one(user, {
		fields: [project.createdBy],
		references: [user.id],
		relationName: 'project_creator'
	}),
	members: many(projectMember)
}));

export const projectMemberRelations = relations(projectMember, ({ one }) => ({
	project: one(project, {
		fields: [projectMember.projectId],
		references: [project.id]
	}),
	user: one(user, {
		fields: [projectMember.userId],
		references: [user.id]
	})
}));

// ─── Project favorites ─────────────────────────────────────────────────────
// Per-user "starred" projects — surfaced in the sidebar's project list.
// Decoupled from membership: you can favorite a project you're not a member
// of, and being a member doesn't auto-favorite.

export const projectFavorite = pgTable(
	'project_favorite',
	{
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		projectId: text('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		addedAt: timestamp('added_at').defaultNow().notNull()
	},
	(t) => [
		primaryKey({ columns: [t.userId, t.projectId] }),
		index('project_favorite_project_idx').on(t.projectId)
	]
);

export type ProjectFavorite = typeof projectFavorite.$inferSelect;

export const projectFavoriteRelations = relations(projectFavorite, ({ one }) => ({
	user: one(user, {
		fields: [projectFavorite.userId],
		references: [user.id]
	}),
	project: one(project, {
		fields: [projectFavorite.projectId],
		references: [project.id]
	})
}));

// ─── Project templates ─────────────────────────────────────────────────────
// Reusable starting points for new projects: a named set of tasks that gets
// copied into a project at creation time. Managed by superadmins under
// /admin/settings/templates. `status` gates visibility in the create-project
// picker: only 'published' templates are offered; 'draft' rows are still being
// authored. Task rows are ordered by `sort_order` and carry the same fields a
// real task starts with (no assignees, no dates — those depend on the project).

export const projectTemplate = pgTable(
	'project_template',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		description: text('description'),
		color: text('color').notNull().default('#7a9cf0'),
		icon: text('icon').notNull().default('T'),
		status: text('status').notNull().default('draft'),
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull()
	},
	(t) => [index('project_template_status_idx').on(t.status)]
);

export type ProjectTemplate = typeof projectTemplate.$inferSelect;
export type ProjectTemplateStatus = 'draft' | 'published';

export const projectTemplateTask = pgTable(
	'project_template_task',
	{
		id: text('id').primaryKey(),
		templateId: text('template_id')
			.notNull()
			.references(() => projectTemplate.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		description: text('description'),
		status: text('status').notNull().default('todo'),
		priority: text('priority').notNull().default('none'),
		type: text('type').notNull().default('task'),
		estimateMinutes: integer('estimate_minutes'),
		tags: text('tags').array().notNull().default([]),
		// Starter checklist copied onto the created task (items always start
		// unticked, whatever the template author toggled while editing).
		checklist: jsonb('checklist')
			.$type<{ id: string; text: string; done: boolean }[]>()
			.notNull()
			.default([]),
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull()
	},
	(t) => [index('project_template_task_template_idx').on(t.templateId, t.sortOrder)]
);

export type ProjectTemplateTask = typeof projectTemplateTask.$inferSelect;

export const projectTemplateRelations = relations(projectTemplate, ({ many }) => ({
	tasks: many(projectTemplateTask)
}));

export const projectTemplateTaskRelations = relations(projectTemplateTask, ({ one }) => ({
	template: one(projectTemplate, {
		fields: [projectTemplateTask.templateId],
		references: [projectTemplate.id]
	})
}));

// ─── Tasks ─────────────────────────────────────────────────────────────────
// Each task has a UUID id and a per-project sequential `number`. The user
// facing identifier `SIWEB-15` is rendered from project.key + task.number.
// Atomic allocation of `number` is done in a transaction by reading and
// incrementing `project.next_task_number` under row lock.

export const task = pgTable(
	'task',
	{
		id: text('id').primaryKey(),
		projectId: text('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		number: integer('number').notNull(),
		title: text('title').notNull(),
		description: text('description'),
		status: text('status').notNull().default('todo'),
		priority: text('priority').notNull().default('none'),
		type: text('type').notNull().default('task'),
		// Which surface created the task: web | mcp | api | import | template.
		channel: text('channel').notNull().default('web'),
		parentId: text('parent_id').references((): AnyPgColumn => task.id, { onDelete: 'set null' }),
		// Set when this task was spun up from a support ticket (admin/team
		// "convert ticket → task" flow). Nullable; one ticket may seed many
		// tasks. `set null` keeps the FK clean if a ticket is ever hard-deleted
		// (normal ticket delete is soft, so the link otherwise survives).
		sourceTicketId: text('source_ticket_id').references((): AnyPgColumn => ticket.id, {
			onDelete: 'set null'
		}),
		dueDate: timestamp('due_date'),
		startDate: timestamp('start_date'),
		endDate: timestamp('end_date'),
		estimateMinutes: integer('estimate_minutes'),
		tags: text('tags').array().notNull().default([]),
		// Lightweight in-task checklist (tick-boxes), distinct from subtasks.
		// Stored inline as an ordered array so progress (done/total) is a trivial
		// read for cards/rows without joins.
		checklist: jsonb('checklist')
			.$type<{ id: string; text: string; done: boolean }[]>()
			.notNull()
			.default([]),
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		archivedAt: timestamp('archived_at'),
		deletedAt: timestamp('deleted_at'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull()
	},
	(t) => [
		uniqueIndex('task_project_number_idx').on(t.projectId, t.number),
		index('task_project_status_idx').on(t.projectId, t.status),
		index('task_parent_idx').on(t.parentId),
		index('task_source_ticket_idx').on(t.sourceTicketId)
	]
);

export type Task = typeof task.$inferSelect;

export const taskAssignee = pgTable(
	'task_assignee',
	{
		taskId: text('task_id')
			.notNull()
			.references(() => task.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		addedAt: timestamp('added_at').defaultNow().notNull()
	},
	(t) => [
		primaryKey({ columns: [t.taskId, t.userId] }),
		index('task_assignee_user_idx').on(t.userId)
	]
);

export type TaskAssignee = typeof taskAssignee.$inferSelect;

export const taskRelations = relations(task, ({ one, many }) => ({
	project: one(project, {
		fields: [task.projectId],
		references: [project.id]
	}),
	parent: one(task, {
		fields: [task.parentId],
		references: [task.id],
		relationName: 'task_parent'
	}),
	creator: one(user, {
		fields: [task.createdBy],
		references: [user.id]
	}),
	assignees: many(taskAssignee)
}));

export const taskAssigneeRelations = relations(taskAssignee, ({ one }) => ({
	task: one(task, {
		fields: [taskAssignee.taskId],
		references: [task.id]
	}),
	user: one(user, {
		fields: [taskAssignee.userId],
		references: [user.id]
	})
}));

// ─── Project activity ────────────────────────────────────────────────────────
// Append-only event log + comment store for a project. One row per event:
// field changes, membership changes, task lifecycle, time logs, and comments.
// `taskId` is non-null when the event concerns a task; it is `set null` (not
// cascade) on task deletion so the history survives — `meta.taskRef` /
// `meta.taskTitle` keep the entry readable after the task is gone.
//
// This is also the single source of truth for comments (the former
// `task_comment` table was folded in here): a comment is a row with
// `type = 'comment'` and the text in `body`. Task-scoped comments carry a
// `taskId`; project-level comments leave it null.

export const PROJECT_ACTIVITY_TYPES = [
	'comment',
	'project.name',
	'project.description',
	'project.status',
	'project.color',
	'project.tags',
	'member.added',
	'member.removed',
	'member.role',
	'lead.set',
	'lead.cleared',
	'task.created',
	'task.status',
	'task.priority',
	'task.type',
	'task.assignee',
	'task.deleted',
	'time.logged'
] as const;
export type ProjectActivityType = (typeof PROJECT_ACTIVITY_TYPES)[number];

// Loosely-typed payload — shape depends on `type`. Common keys: `from`/`to`
// for field changes, `field` to name the changed attribute, `minutes`/`note`
// for time logs, `userId`/`role` for membership, `taskRef`/`taskTitle` to
// preserve a deleted task's identity.
export type ProjectActivityMeta = Record<string, unknown>;

export const projectActivity = pgTable(
	'project_activity',
	{
		id: text('id').primaryKey(),
		projectId: text('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		taskId: text('task_id').references(() => task.id, { onDelete: 'set null' }),
		actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
		type: text('type').$type<ProjectActivityType>().notNull(),
		body: text('body'),
		meta: jsonb('meta').$type<ProjectActivityMeta>(),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull()
	},
	(t) => [
		index('project_activity_project_idx').on(t.projectId, t.createdAt),
		index('project_activity_task_idx')
			.on(t.taskId, t.createdAt)
			.where(sql`${t.taskId} is not null`)
	]
);

export type ProjectActivity = typeof projectActivity.$inferSelect;

export const projectActivityRelations = relations(projectActivity, ({ one }) => ({
	project: one(project, {
		fields: [projectActivity.projectId],
		references: [project.id]
	}),
	task: one(task, {
		fields: [projectActivity.taskId],
		references: [task.id]
	}),
	actor: one(user, {
		fields: [projectActivity.actorId],
		references: [user.id]
	})
}));
// ─── Task time logs ────────────────────────────────────────────────────────

export const taskTimeLog = pgTable(
	'task_time_log',
	{
		id: text('id').primaryKey(),
		taskId: text('task_id')
			.notNull()
			.references(() => task.id, { onDelete: 'cascade' }),
		userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
		minutes: integer('minutes').notNull(),
		note: text('note'),
		loggedAt: date('logged_at').notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(t) => [
		index('task_time_log_task_idx').on(t.taskId, t.loggedAt),
		index('task_time_log_user_idx').on(t.userId)
	]
);

export type TaskTimeLog = typeof taskTimeLog.$inferSelect;

export const taskTimeLogRelations = relations(taskTimeLog, ({ one }) => ({
	task: one(task, {
		fields: [taskTimeLog.taskId],
		references: [task.id]
	}),
	user: one(user, {
		fields: [taskTimeLog.userId],
		references: [user.id]
	})
}));

// ─── Task planning (per-user "my week" picks) ──────────────────────────────
// A row says "user U plans to work on task T on date D". Composite PK lets
// each (task, user) have exactly one plan; the date can be moved by updating
// in place. Different users can plan the same task on different days.

export const taskPlanning = pgTable(
	'task_planning',
	{
		taskId: text('task_id')
			.notNull()
			.references(() => task.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		plannedFor: date('planned_for'),
		orderInDay: integer('order_in_day').notNull().default(0),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull()
	},
	(t) => [
		primaryKey({ columns: [t.taskId, t.userId] }),
		index('task_planning_user_day_idx').on(t.userId, t.plannedFor)
	]
);

export type TaskPlanning = typeof taskPlanning.$inferSelect;

export const taskPlanningRelations = relations(taskPlanning, ({ one }) => ({
	task: one(task, {
		fields: [taskPlanning.taskId],
		references: [task.id]
	}),
	user: one(user, {
		fields: [taskPlanning.userId],
		references: [user.id]
	})
}));

// ─── Roles & permissions ───────────────────────────────────────────────────
// Built-in roles are seeded by migration and treated as read-only by the
// app for now. `organization_member.role` and `project_member.role` hold
// strings that match `role.id` — kept as plain text (no FK) until the
// editable / custom-role feature lands.

export const role = pgTable(
	'role',
	{
		id: text('id').primaryKey(),
		scope: text('scope').notNull(), // 'org' | 'project'
		label: text('label').notNull(),
		description: text('description'),
		color: text('color'),
		// True for seeded built-ins. UI hides edit/delete for builtin rows.
		builtin: boolean('builtin').notNull().default(false),
		// True for roles only assignable on the internal Trackr org
		// (superadmin/admin/staff).
		internalOnly: boolean('internal_only').notNull().default(false),
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(t) => [index('role_scope_idx').on(t.scope, t.sortOrder)]
);

export type Role = typeof role.$inferSelect;

export const rolePermission = pgTable(
	'role_permission',
	{
		roleId: text('role_id')
			.notNull()
			.references(() => role.id, { onDelete: 'cascade' }),
		permission: text('permission').notNull()
	},
	(t) => [primaryKey({ columns: [t.roleId, t.permission] })]
);

export type RolePermission = typeof rolePermission.$inferSelect;

export const rolePermissionRelations = relations(rolePermission, ({ one }) => ({
	role: one(role, {
		fields: [rolePermission.roleId],
		references: [role.id]
	})
}));

export const roleRelations = relations(role, ({ many }) => ({
	permissions: many(rolePermission)
}));

// ─── User preferences ──────────────────────────────────────────────────────
// One row per user. Scalar columns for things we want to query/index; jsonb
// for shapes that grow (notification categories, per-view saved state) so
// adding a category doesn't require a migration.

// Email delivery per event: 'off' (never), 'instant' (send immediately), or
// 'digest' (batch into the periodic rollup email — see `DigestConfig`). Stored
// values may still be legacy booleans (true→instant, false→off); getPreferences
// normalizes them so the rest of the app only ever sees a DeliveryMode.
export type DeliveryMode = 'off' | 'instant' | 'digest';
export type NotificationChannelPrefs = { email: DeliveryMode; inApp: boolean };

// Suppress instant email during these local-time windows; suppressed mail is
// deferred into the digest queue instead of dropped. `start`/`end` are 'HH:MM'
// in DIGEST_TZ; a window that wraps midnight (start > end) is supported.
export type QuietHours = { enabled: boolean; start: string; end: string; weekends: boolean };

// When to flush a user's batched (digest) email. `hour` is 0–23 in DIGEST_TZ,
// used only for the 'daily' cadence.
export type DigestConfig = { frequency: 'hourly' | 'daily'; hour: number };

// How wide an audience event a see-all user (org.client / org.agent / internal
// staff) wants to hear about, per surface:
//   all           — every ticket/thread they can see (current behaviour)
//   participating — only ones they're assigned to / involved in / follow
//   mentions      — nothing but @-mentions (delivered via the *Mentioned kinds)
// Own-tickets-only members (org.member) are unaffected: they only ever receive
// their own items regardless of this setting.
export type ScopeMode = 'all' | 'participating' | 'mentions';
export type NotificationScope = { tickets: ScopeMode; chat: ScopeMode };
export type NotificationPrefs = Partial<{
	// Legacy generic @-mention key. Mentions are now emitted per surface
	// (`taskMentioned` / `ticketMentioned` / `chatMentioned` / `projectMentioned`)
	// so each can be controlled independently. Kept only so old inbox rows and
	// stored prefs still resolve; no longer emitted.
	mentioned: NotificationChannelPrefs;
	taskAssigned: NotificationChannelPrefs;
	// @-mention in a task.
	taskMentioned: NotificationChannelPrefs;
	taskCommented: NotificationChannelPrefs;
	taskStatusChanged: NotificationChannelPrefs;
	taskDueSoon: NotificationChannelPrefs;
	ticketCreated: NotificationChannelPrefs;
	ticketAssigned: NotificationChannelPrefs;
	// Ticket status or priority change.
	ticketStatusChanged: NotificationChannelPrefs;
	ticketMessage: NotificationChannelPrefs;
	// @-mention in a ticket message.
	ticketMentioned: NotificationChannelPrefs;
	chatMessage: NotificationChannelPrefs;
	// @-mention in a chat thread.
	chatMentioned: NotificationChannelPrefs;
	// @-mention in a project discussion.
	projectMentioned: NotificationChannelPrefs;
	wikiUpdated: NotificationChannelPrefs;
	// Admin-only: a webhook subscription was auto-disabled after sustained failures.
	webhookDisabled: NotificationChannelPrefs;
}>;

export const userPreferences = pgTable('user_preferences', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	theme: text('theme').notNull().default('dark'),
	density: text('density').notNull().default('comfortable'),
	defaultLanding: text('default_landing').notNull().default('/week'),
	weekStartsOn: integer('week_starts_on').notNull().default(1),
	locale: text('locale').notNull().default('en'),
	notifications: jsonb('notifications').$type<NotificationPrefs>().notNull().default({}),
	// Quiet hours + digest cadence. Defaults are inert: quiet hours off, and the
	// daily digest only ever runs for events a user has explicitly set to 'digest'.
	quietHours: jsonb('quiet_hours')
		.$type<QuietHours>()
		.notNull()
		.default({ enabled: false, start: '20:00', end: '08:00', weekends: true }),
	digest: jsonb('digest').$type<DigestConfig>().notNull().default({ frequency: 'daily', hour: 9 }),
	// Per-surface audience scope for see-all users. Default 'all' preserves
	// existing behaviour; only see-all roles ever surface these controls.
	notificationScope: jsonb('notification_scope')
		.$type<NotificationScope>()
		.notNull()
		.default({ tickets: 'all', chat: 'all' }),
	viewState: jsonb('view_state').$type<Record<string, unknown>>().notNull().default({}),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at')
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull()
});

export type UserPreferences = typeof userPreferences.$inferSelect;

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
	user: one(user, {
		fields: [userPreferences.userId],
		references: [user.id]
	})
}));

// ─── Collaborative documents ─────────────────────────────────────────────────
// Feature-agnostic rich-text primitive backing real-time collaborative editing.
// `ydoc` is the authoritative Yjs CRDT state (binary); `body_html` is a derived
// read-model regenerated server-side on every persist, used for SSR/no-JS
// rendering and previews. Features (wiki, future meeting notes, …) reference a
// document by FK; the Hocuspocus server only ever deals with this table by id.

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
	dataType: () => 'bytea',
	toDriver: (v) => Buffer.from(v),
	fromDriver: (v) => new Uint8Array(v as Buffer)
});

export const document = pgTable('document', {
	id: text('id').primaryKey(),
	// Null until the first debounced store from Hocuspocus; seeded lazily from
	// `body_html` on first load (see onLoadDocument).
	ydoc: bytea('ydoc'),
	bodyHtml: text('body_html').notNull().default(''),
	updatedAt: timestamp('updated_at')
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull()
});

export type Document = typeof document.$inferSelect;

// ─── Wiki ──────────────────────────────────────────────────────────────────
// One row per page or folder. Folders are pages with `is_folder = true` and
// (typically) empty body; they exist to group children in the sidebar.
// `parent_id` self-references for the tree; null = root. Page content lives in
// the linked `document` (Yjs + derived HTML); the legacy `body` column is kept
// as a seed source / fallback during the collab rollout.

export const wikiPage = pgTable(
	'wiki_page',
	{
		id: text('id').primaryKey(),
		parentId: text('parent_id').references((): AnyPgColumn => wikiPage.id, {
			onDelete: 'cascade'
		}),
		title: text('title').notNull(),
		icon: text('icon').notNull().default('book'),
		isFolder: boolean('is_folder').notNull().default(false),
		body: text('body').notNull().default(''),
		documentId: text('document_id').references(() => document.id, { onDelete: 'set null' }),
		authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
		updatedById: text('updated_by_id').references(() => user.id, { onDelete: 'set null' }),
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull()
	},
	(t) => [index('wiki_page_parent_idx').on(t.parentId, t.sortOrder)]
);

export type WikiPage = typeof wikiPage.$inferSelect;

export const wikiPageRelations = relations(wikiPage, ({ one }) => ({
	document: one(document, {
		fields: [wikiPage.documentId],
		references: [document.id]
	}),
	parent: one(wikiPage, {
		fields: [wikiPage.parentId],
		references: [wikiPage.id],
		relationName: 'wiki_parent'
	}),
	author: one(user, {
		fields: [wikiPage.authorId],
		references: [user.id],
		relationName: 'wiki_author'
	}),
	updatedBy: one(user, {
		fields: [wikiPage.updatedById],
		references: [user.id],
		relationName: 'wiki_updated_by'
	})
}));

// ─── Notes ───────────────────────────────────────────────────────────────
// A note owns a collaborative `document` like a wiki page, but lives outside the
// wiki tree. Two kinds:
//   - 'quick'   : frictionless personal capture. Owner-private; the owner can
//                 mint share links (read / read-write) for internal teammates.
//   - 'meeting' : time-anchored, REQUIRED to link a project or task; created
//                 from an optional template. Access is inherited from the
//                 linked project/task.
// The whole feature is internal-team gated (like wiki); sharing widens a single
// quick note to specific teammates via `note_access`.

export const noteTemplate = pgTable('note_template', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	icon: text('icon').notNull().default('file-text'),
	// null owner = system/seeded template available to everyone.
	ownerId: text('owner_id').references(() => user.id, { onDelete: 'cascade' }),
	isSystem: boolean('is_system').notNull().default(false),
	// Skeleton stored as HTML; applied by seeding a new note's `document.body_html`
	// and letting Hocuspocus' onLoadDocument build the ydoc lazily on first open.
	bodyHtml: text('body_html').notNull().default(''),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at')
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull()
});

export type NoteTemplate = typeof noteTemplate.$inferSelect;

export const note = pgTable(
	'note',
	{
		id: text('id').primaryKey(),
		kind: text('kind').notNull().default('quick'), // 'quick' | 'meeting'
		title: text('title').notNull().default(''),
		icon: text('icon').notNull().default('file-text'),
		documentId: text('document_id').references(() => document.id, { onDelete: 'set null' }),
		ownerId: text('owner_id').references(() => user.id, { onDelete: 'set null' }),
		updatedById: text('updated_by_id').references(() => user.id, { onDelete: 'set null' }),
		pinned: boolean('pinned').notNull().default(false),
		// Meeting-only (null for quick notes).
		meetingDate: timestamp('meeting_date'),
		projectId: text('project_id').references(() => project.id, { onDelete: 'set null' }),
		taskId: text('task_id').references(() => task.id, { onDelete: 'set null' }),
		templateId: text('template_id').references(() => noteTemplate.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull()
	},
	(t) => [
		index('note_owner_idx').on(t.ownerId, t.updatedAt),
		index('note_kind_date_idx').on(t.kind, t.meetingDate)
	]
);

export type Note = typeof note.$inferSelect;

// A share link the owner mints for a quick note. The websocket only carries the
// viewer's userId, so the token alone can't authorize a collab connection;
// redeeming a link resolves it to a per-user `note_access` row instead.
export const noteShareLink = pgTable('note_share_link', {
	id: text('id').primaryKey(),
	noteId: text('note_id')
		.notNull()
		.references(() => note.id, { onDelete: 'cascade' }),
	token: text('token').notNull().unique(),
	role: text('role').notNull().default('read'), // 'read' | 'write'
	createdById: text('created_by_id').references(() => user.id, { onDelete: 'set null' }),
	revokedAt: timestamp('revoked_at'),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

export type NoteShareLink = typeof noteShareLink.$inferSelect;

// Per-user grant resolved when a teammate redeems a share link. Read by collab
// auth (resolveNoteRole) and the "shared with me" list. Owner is implicit write.
export const noteAccess = pgTable(
	'note_access',
	{
		id: text('id').primaryKey(),
		noteId: text('note_id')
			.notNull()
			.references(() => note.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		role: text('role').notNull().default('read'), // 'read' | 'write'
		grantedVia: text('granted_via').references(() => noteShareLink.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(t) => [uniqueIndex('note_access_note_user_idx').on(t.noteId, t.userId)]
);

export type NoteAccess = typeof noteAccess.$inferSelect;

export const noteRelations = relations(note, ({ one, many }) => ({
	document: one(document, {
		fields: [note.documentId],
		references: [document.id]
	}),
	owner: one(user, {
		fields: [note.ownerId],
		references: [user.id],
		relationName: 'note_owner'
	}),
	updatedBy: one(user, {
		fields: [note.updatedById],
		references: [user.id],
		relationName: 'note_updated_by'
	}),
	project: one(project, {
		fields: [note.projectId],
		references: [project.id]
	}),
	task: one(task, {
		fields: [note.taskId],
		references: [task.id]
	}),
	template: one(noteTemplate, {
		fields: [note.templateId],
		references: [noteTemplate.id]
	}),
	shareLinks: many(noteShareLink),
	access: many(noteAccess)
}));

export const noteShareLinkRelations = relations(noteShareLink, ({ one }) => ({
	note: one(note, { fields: [noteShareLink.noteId], references: [note.id] })
}));

export const noteAccessRelations = relations(noteAccess, ({ one }) => ({
	note: one(note, { fields: [noteAccess.noteId], references: [note.id] }),
	user: one(user, { fields: [noteAccess.userId], references: [user.id] })
}));

// ─── Tickets ───────────────────────────────────────────────────────────────
// Org-scoped support requests. Clients (org.client role) see only tickets in
// their own org; internal Trackr staff act as agents and see every org's
// tickets. Numbering is per-org via `organization.next_ticket_number`,
// allocated in a transaction the same way `task.number` is.

export const ticket = pgTable(
	'ticket',
	{
		id: text('id').primaryKey(),
		orgId: text('org_id')
			.notNull()
			.references(() => organization.id, { onDelete: 'cascade' }),
		number: integer('number').notNull(),
		subject: text('subject').notNull(),
		description: text('description'),
		status: text('status').notNull().default('open'),
		priority: text('priority').notNull().default('medium'),
		category: text('category').notNull().default('general'),
		channel: text('channel').notNull().default('web_form'),
		customerId: text('customer_id').references(() => user.id, { onDelete: 'set null' }),
		// Assignees live in the `ticket_assignee` join table (multi-assignee), same
		// as tasks — there is no scalar assignee column on the ticket row.
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		// Set when this ticket was created from a chat thread (the "create ticket
		// from thread" flow). Nullable; back-links the ticket to its origin
		// conversation. `set null` keeps the FK clean if the thread is ever
		// hard-deleted (thread delete is soft, so the link otherwise survives).
		sourceThreadId: text('source_thread_id').references((): AnyPgColumn => thread.id, {
			onDelete: 'set null'
		}),
		firstResponseAt: timestamp('first_response_at'),
		resolvedAt: timestamp('resolved_at'),
		closedAt: timestamp('closed_at'),
		satisfactionScore: integer('satisfaction_score'),
		tags: text('tags').array().notNull().default([]),
		// Lightweight shared checklist (tick-boxes) on the ticket. Stored inline
		// as an ordered array — same shape as tasks — so progress (done/total) is
		// a trivial read for cards/rows without joins.
		checklist: jsonb('checklist')
			.$type<{ id: string; text: string; done: boolean }[]>()
			.notNull()
			.default([]),
		// Soft delete: set when an admin deletes the ticket. Non-null rows are
		// excluded from every read path (list, detail, mutations).
		deletedAt: timestamp('deleted_at'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull()
	},
	(t) => [
		uniqueIndex('ticket_org_number_idx').on(t.orgId, t.number),
		index('ticket_org_status_idx').on(t.orgId, t.status),
		index('ticket_customer_idx').on(t.customerId),
		index('ticket_source_thread_idx').on(t.sourceThreadId)
	]
);

export type Ticket = typeof ticket.$inferSelect;

// Multi-assignee join table (mirrors `taskAssignee`). Tickets are assigned to
// internal agents; the composite PK dedupes and the userId index powers the
// "tickets assigned to me" reverse lookup.
export const ticketAssignee = pgTable(
	'ticket_assignee',
	{
		ticketId: text('ticket_id')
			.notNull()
			.references(() => ticket.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		addedAt: timestamp('added_at').defaultNow().notNull()
	},
	(t) => [
		primaryKey({ columns: [t.ticketId, t.userId] }),
		index('ticket_assignee_user_idx').on(t.userId)
	]
);

export type TicketAssignee = typeof ticketAssignee.$inferSelect;

export const ticketMessage = pgTable(
	'ticket_message',
	{
		id: text('id').primaryKey(),
		ticketId: text('ticket_id')
			.notNull()
			.references(() => ticket.id, { onDelete: 'cascade' }),
		authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
		body: text('body').notNull(),
		// Hidden from client viewers — agents-only annotations on the thread.
		isInternalNote: boolean('is_internal_note').notNull().default(false),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull()
	},
	(t) => [index('ticket_message_ticket_idx').on(t.ticketId, t.createdAt)]
);

export type TicketMessage = typeof ticketMessage.$inferSelect;

export const ticketRelations = relations(ticket, ({ one, many }) => ({
	org: one(organization, {
		fields: [ticket.orgId],
		references: [organization.id]
	}),
	customer: one(user, {
		fields: [ticket.customerId],
		references: [user.id],
		relationName: 'ticket_customer'
	}),
	creator: one(user, {
		fields: [ticket.createdBy],
		references: [user.id],
		relationName: 'ticket_creator'
	}),
	assignees: many(ticketAssignee),
	messages: many(ticketMessage)
}));

export const ticketAssigneeRelations = relations(ticketAssignee, ({ one }) => ({
	ticket: one(ticket, {
		fields: [ticketAssignee.ticketId],
		references: [ticket.id]
	}),
	user: one(user, {
		fields: [ticketAssignee.userId],
		references: [user.id]
	})
}));

export const ticketMessageRelations = relations(ticketMessage, ({ one }) => ({
	ticket: one(ticket, {
		fields: [ticketMessage.ticketId],
		references: [ticket.id]
	}),
	author: one(user, {
		fields: [ticketMessage.authorId],
		references: [user.id]
	})
}));

// ─── Ticket pinning ──────────────────────────────────────────────────────────
// Per-user pinned tickets, surfaced in the org portal sidebar. Mirrors
// `projectFavorite`: composite (userId, ticketId), cascade on either delete.

export const ticketFavorite = pgTable(
	'ticket_favorite',
	{
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		ticketId: text('ticket_id')
			.notNull()
			.references(() => ticket.id, { onDelete: 'cascade' }),
		addedAt: timestamp('added_at').defaultNow().notNull()
	},
	(t) => [
		primaryKey({ columns: [t.userId, t.ticketId] }),
		index('ticket_favorite_ticket_idx').on(t.ticketId)
	]
);

export type TicketFavorite = typeof ticketFavorite.$inferSelect;

export const ticketFavoriteRelations = relations(ticketFavorite, ({ one }) => ({
	user: one(user, { fields: [ticketFavorite.userId], references: [user.id] }),
	ticket: one(ticket, { fields: [ticketFavorite.ticketId], references: [ticket.id] })
}));

// ─── Threads & messages ──────────────────────────────────────────────────────
// The unified messaging core. A `thread` is a conversation; a `message` is one
// post in it. A thread carries *what it's attached to* via (subjectType,
// subjectId) — access is derived from that subject, never stored. v1 uses only
// `subjectType='org'` (the org-wide support chat: "a chat" is simply all threads
// whose subject is that org). The other subject types are reserved so task
// comments, ticket conversations, project chat and DMs can fold onto this table
// additively later.

export const THREAD_SUBJECT_TYPES = ['org', 'project', 'ticket', 'task', 'dm'] as const;
export type ThreadSubjectType = (typeof THREAD_SUBJECT_TYPES)[number];

export const thread = pgTable(
	'thread',
	{
		id: text('id').primaryKey(),
		subjectType: text('subject_type').$type<ThreadSubjectType>().notNull(),
		subjectId: text('subject_id').notNull(),
		// Null for entity-attached threads (the parent supplies the title); set for
		// standalone chat threads.
		title: text('title'),
		status: text('status').notNull().default('open'), // 'open' | 'resolved'
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		deletedAt: timestamp('deleted_at'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull()
	},
	(t) => [
		index('thread_subject_idx').on(t.subjectType, t.subjectId, t.updatedAt),
		// Entity-attached threads are 1:1 with their subject (a task/ticket has
		// exactly one thread). Chat subjects (org/project/dm) are many-per-subject.
		uniqueIndex('thread_entity_unique')
			.on(t.subjectType, t.subjectId)
			.where(sql`${t.subjectType} in ('ticket', 'task')`)
	]
);

export type Thread = typeof thread.$inferSelect;

export const MESSAGE_KINDS = ['comment', 'system'] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export const message = pgTable(
	'message',
	{
		id: text('id').primaryKey(),
		threadId: text('thread_id')
			.notNull()
			.references(() => thread.id, { onDelete: 'cascade' }),
		authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
		body: text('body').notNull(),
		// 'comment' = human message; 'system' reserved for folded-in activity events.
		kind: text('kind').$type<MessageKind>().notNull().default('comment'),
		// Agents-only note on a ticket thread (hidden from the customer). Always
		// false for org-chat / task threads. Replaces ticket_message.is_internal_note.
		internal: boolean('internal').notNull().default(false),
		meta: jsonb('meta').$type<Record<string, unknown>>(),
		editedAt: timestamp('edited_at'),
		deletedAt: timestamp('deleted_at'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull()
	},
	(t) => [index('message_thread_idx').on(t.threadId, t.createdAt)]
);

export type Message = typeof message.$inferSelect;

export const threadRelations = relations(thread, ({ one, many }) => ({
	creator: one(user, { fields: [thread.createdBy], references: [user.id] }),
	messages: many(message),
	tags: many(threadTag)
}));

export const messageRelations = relations(message, ({ one }) => ({
	thread: one(thread, { fields: [message.threadId], references: [thread.id] }),
	author: one(user, { fields: [message.authorId], references: [user.id] })
}));

// ─── Tags ────────────────────────────────────────────────────────────────────
// First-class, shared tag vocabulary. `orgId` scopes the vocabulary to an org;
// `org_id IS NULL` = internal/team tags (mirrors how internal projects use a
// null org). Links to entities live in per-entity join tables (v1 needs only
// `thread_tag`; `task_tag`/`ticket_tag` arrive when those migrate). Follow/mute
// is a single global `tag_subscription` so "follow Features / mute SEO" works
// across every entity type.

export const tag = pgTable(
	'tag',
	{
		id: text('id').primaryKey(),
		orgId: text('org_id').references(() => organization.id, { onDelete: 'cascade' }),
		label: text('label').notNull(),
		color: text('color'),
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(t) => [
		uniqueIndex('tag_org_label_idx').on(t.orgId, t.label),
		// Postgres treats NULLs as distinct, so the composite unique above does not
		// cover internal (null-org) tags — enforce those separately.
		uniqueIndex('tag_internal_label_idx')
			.on(t.label)
			.where(sql`${t.orgId} is null`)
	]
);

export type Tag = typeof tag.$inferSelect;

export const tagRelations = relations(tag, ({ one, many }) => ({
	org: one(organization, { fields: [tag.orgId], references: [organization.id] }),
	threads: many(threadTag),
	subscriptions: many(tagSubscription)
}));

export const threadTag = pgTable(
	'thread_tag',
	{
		threadId: text('thread_id')
			.notNull()
			.references(() => thread.id, { onDelete: 'cascade' }),
		tagId: text('tag_id')
			.notNull()
			.references(() => tag.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.threadId, t.tagId] }), index('thread_tag_tag_idx').on(t.tagId)]
);

export type ThreadTag = typeof threadTag.$inferSelect;

export const threadTagRelations = relations(threadTag, ({ one }) => ({
	thread: one(thread, { fields: [threadTag.threadId], references: [thread.id] }),
	tag: one(tag, { fields: [threadTag.tagId], references: [tag.id] })
}));

// Per-user follow/mute of a tag. Absence = default (no override). 'all' =
// notify me about anything tagged this, even unassigned/unmentioned; 'muted' =
// suppress (mentions still win).
export const tagSubscription = pgTable(
	'tag_subscription',
	{
		tagId: text('tag_id')
			.notNull()
			.references(() => tag.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		mode: text('mode').$type<'all' | 'muted'>().notNull(),
		updatedAt: timestamp('updated_at').defaultNow().notNull()
	},
	(t) => [
		primaryKey({ columns: [t.tagId, t.userId] }),
		index('tag_subscription_user_idx').on(t.userId)
	]
);

export type TagSubscription = typeof tagSubscription.$inferSelect;

export const tagSubscriptionRelations = relations(tagSubscription, ({ one }) => ({
	tag: one(tag, { fields: [tagSubscription.tagId], references: [tag.id] }),
	user: one(user, { fields: [tagSubscription.userId], references: [user.id] })
}));

// Per-user last-read cursor for a thread — drives unread badges. Pure UX state;
// never gates access.
export const threadRead = pgTable(
	'thread_read',
	{
		threadId: text('thread_id')
			.notNull()
			.references(() => thread.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		lastReadAt: timestamp('last_read_at').defaultNow().notNull()
	},
	(t) => [primaryKey({ columns: [t.threadId, t.userId] })]
);

export type ThreadRead = typeof threadRead.$inferSelect;

// ─── Attachments ─────────────────────────────────────────────────────────────
// One row per uploaded file. Polymorphic: a single table serves every parent
// (tickets, tasks, wiki pages, ticket messages, task comments) via
// `entity_type` + `entity_id` — the parents live in different tables with
// different scopes, so a per-parent FK column would be sparse and awkward.
//
// Because the link is polymorphic there is no DB-level FK cascade from the
// parent; instead `org_id`/`project_id` cascade-delete the row when the *org*
// or *project* goes away, and the parent's delete path calls
// `deleteAttachmentsFor(...)` for finer-grained cleanup. An orphaned row simply
// stops being served (its parent is gone); an orphaned file is harmless.
//
// File bytes live in the storage layer (local disk today) under
// `attachments/<id>/original` (+ `/thumb` for images); only metadata is here.

export const attachment = pgTable(
	'attachment',
	{
		id: text('id').primaryKey(),
		entityType: text('entity_type').$type<AttachmentEntityType>().notNull(),
		entityId: text('entity_id').notNull(),
		// Denormalized scope captured at upload time so serve/delete endpoints can
		// assertCan() without re-walking the parent. Null org = team-only (wiki).
		orgId: text('org_id').references(() => organization.id, { onDelete: 'cascade' }),
		projectId: text('project_id').references(() => project.id, { onDelete: 'cascade' }),
		uploadedBy: text('uploaded_by').references(() => user.id, { onDelete: 'set null' }),
		// Base key in the storage layer: `attachments/<id>`.
		storageKey: text('storage_key').notNull(),
		filename: text('filename').notNull(),
		mimeType: text('mime_type').notNull(),
		sizeBytes: integer('size_bytes').notNull(),
		// Image-only niceties (null for non-images). `thumbhash` is a tiny (~25
		// byte) blurred preview inlined as a placeholder before the thumb loads.
		width: integer('width'),
		height: integer('height'),
		hasThumbnail: boolean('has_thumbnail').notNull().default(false),
		thumbhash: bytea('thumbhash'),
		// Soft delete: matches the ticket/task pattern. Non-null rows are excluded
		// from every read path and no longer served.
		deletedAt: timestamp('deleted_at'),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(t) => [
		index('attachment_entity_idx').on(t.entityType, t.entityId),
		index('attachment_org_idx').on(t.orgId)
	]
);

export type Attachment = typeof attachment.$inferSelect;

export const attachmentRelations = relations(attachment, ({ one }) => ({
	uploader: one(user, {
		fields: [attachment.uploadedBy],
		references: [user.id]
	}),
	org: one(organization, {
		fields: [attachment.orgId],
		references: [organization.id]
	}),
	project: one(project, {
		fields: [attachment.projectId],
		references: [project.id]
	})
}));

// ─── Notifications ─────────────────────────────────────────────────────────
// Per-recipient inbox. One row = one in-app notification. Email delivery is
// decided by user prefs at emit time and is not represented here. `kind`
// matches `NotificationPrefs` keys. `entityType/entityId` are used to mark
// rows read when the recipient opens the related entity page.

export const NOTIFICATION_KINDS = [
	'mentioned',
	'taskAssigned',
	'taskMentioned',
	'taskCommented',
	'taskStatusChanged',
	'taskDueSoon',
	'ticketCreated',
	'ticketAssigned',
	'ticketStatusChanged',
	'ticketMessage',
	'ticketMentioned',
	'chatMessage',
	'chatMentioned',
	'projectMentioned',
	'wikiUpdated',
	'webhookDisabled'
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const notification = pgTable(
	'notification',
	{
		id: text('id').primaryKey(),
		recipientId: text('recipient_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		orgId: text('org_id').references(() => organization.id, { onDelete: 'cascade' }),
		kind: text('kind').$type<NotificationKind>().notNull(),
		title: text('title').notNull(),
		body: text('body'),
		url: text('url').notNull(),
		actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
		entityType: text('entity_type'),
		entityId: text('entity_id'),
		readAt: timestamp('read_at'),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(t) => [
		index('notification_recipient_created_idx').on(t.recipientId, t.createdAt),
		index('notification_recipient_unread_idx').on(t.recipientId, t.readAt),
		index('notification_entity_idx').on(t.entityType, t.entityId)
	]
);

export type Notification = typeof notification.$inferSelect;

export const notificationRelations = relations(notification, ({ one }) => ({
	recipient: one(user, {
		fields: [notification.recipientId],
		references: [user.id],
		relationName: 'notification_recipient'
	}),
	actor: one(user, {
		fields: [notification.actorId],
		references: [user.id],
		relationName: 'notification_actor'
	}),
	org: one(organization, {
		fields: [notification.orgId],
		references: [organization.id]
	})
}));

// ─── Notification digest queue ───────────────────────────────────────────────
// One row per notification whose recipient chose 'digest' email for that event
// (or whose 'instant' email was deferred by quiet hours). The Go worker's
// `notify.digest` scheduled job drains each due user's unsent rows into a single
// rollup email and stamps `sentAt`. Timestamps are timestamptz — the worker
// compares them against now() in DIGEST_TZ.
export const notificationDigestItem = pgTable(
	'notification_digest_item',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		orgId: text('org_id').references(() => organization.id, { onDelete: 'cascade' }),
		kind: text('kind').$type<NotificationKind>().notNull(),
		title: text('title').notNull(),
		body: text('body'),
		url: text('url').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		sentAt: timestamp('sent_at', { withTimezone: true })
	},
	(t) => [
		// The flush query scans a user's still-pending items, oldest first.
		index('notif_digest_pending_idx')
			.on(t.userId, t.createdAt)
			.where(sql`sent_at is null`)
	]
);

export type NotificationDigestItem = typeof notificationDigestItem.$inferSelect;

// ─── Push tokens ─────────────────────────────────────────────────────────────
// Device registrations from the native (Tauri) app. Rows are written by
// /api/v1/push/tokens and will be consumed by the Go worker's future
// `push.send` job (FCM/APNs). Until that ships, registrations are stored but
// nothing is delivered (notify()'s push channel is behind PUSH_ENABLED).
// `token` is globally unique — re-registering an existing token re-homes it to
// the signing-in user (device handed to someone else) and bumps lastSeenAt.

export const pushToken = pgTable(
	'push_token',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		token: text('token').notNull(),
		platform: text('platform').notNull(), // 'ios' | 'android'
		deviceName: text('device_name'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		lastSeenAt: timestamp('last_seen_at').defaultNow().notNull()
	},
	(t) => [
		uniqueIndex('push_token_token_idx').on(t.token),
		index('push_token_user_idx').on(t.userId)
	]
);

export type PushToken = typeof pushToken.$inferSelect;

// ─── Feedback ──────────────────────────────────────────────────────────────
// User-submitted feedback from the "Send feedback" modal in the account
// dropdown. `url` and `userAgent` capture the page and browser context at
// submission time so bug reports are actionable without follow-up.

export const feedback = pgTable(
	'feedback',
	{
		id: text('id').primaryKey(),
		userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
		kind: text('kind').notNull().default('general'), // 'bug' | 'idea' | 'general'
		message: text('message').notNull(),
		url: text('url'),
		userAgent: text('user_agent'),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(t) => [index('feedback_created_idx').on(t.createdAt)]
);

export type Feedback = typeof feedback.$inferSelect;

export const feedbackRelations = relations(feedback, ({ one }) => ({
	user: one(user, {
		fields: [feedback.userId],
		references: [user.id]
	})
}));

// ─── Audit log ───────────────────────────────────────────────────────────────
// Workspace-wide security/admin trail: one row per meaningful action (auth,
// membership, project/task/ticket lifecycle, settings). Written via
// `recordAudit` in $lib/server/audit. `actorId` is `set null` on user delete so
// history survives — `actorLabel` snapshots the name/email at write time and
// also names anonymous actors (e.g. a failed login). `kind` is the filter
// bucket (auth|member|project|task|ticket|settings); `meta` carries the rich
// payload shown in the detail drawer.

export const auditLog = pgTable(
	'audit_log',
	{
		id: text('id').primaryKey(),
		type: text('type').notNull(),
		kind: text('kind').notNull(),
		actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
		actorLabel: text('actor_label'),
		targetType: text('target_type'),
		targetId: text('target_id'),
		targetLabel: text('target_label'),
		orgId: text('org_id'),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		meta: jsonb('meta').$type<Record<string, unknown>>(),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(t) => [
		index('audit_log_created_idx').on(t.createdAt),
		index('audit_log_kind_created_idx').on(t.kind, t.createdAt),
		index('audit_log_type_idx').on(t.type),
		index('audit_log_actor_idx').on(t.actorId)
	]
);

export type AuditLog = typeof auditLog.$inferSelect;

// ─── Webhooks ────────────────────────────────────────────────────────────────
// Outbound webhooks are workspace-scoped: a subscription is owned by the
// internal workspace (managed under /admin/settings/webhooks) and narrowed with
// filters. One `webhook_event` row is written per emitted event (the payload is
// built once, in TS), one `webhook_delivery` per (event × matching
// subscription), and one `webhook_delivery_attempt` per HTTP attempt. Delivery
// itself is done by the Go worker (`webhook.deliver` job), which owns the retry
// schedule; see $lib/server/webhooks.

export const WEBHOOK_DELIVERY_STATUSES = [
	'pending',
	'success',
	'failed',
	'exhausted',
	'cancelled'
] as const;
export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number];

export const WEBHOOK_DISABLED_REASONS = ['manual', 'failures'] as const;
export type WebhookDisabledReason = (typeof WEBHOOK_DISABLED_REASONS)[number];

/** Sentinel accepted in `orgIds` meaning "internal work (project.org_id IS NULL)". */
export const WEBHOOK_INTERNAL_ORG = 'internal';

export const webhookSubscription = pgTable(
	'webhook_subscription',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		url: text('url').notNull(),
		description: text('description'),
		// Plaintext in v1 (same trust level as session.token). The Go worker reads
		// it to sign deliveries. Shown once in the UI; "rotate" replaces it.
		secret: text('secret').notNull(),
		eventTypes: jsonb('event_types').$type<string[]>().notNull(),
		// null = all. May contain WEBHOOK_INTERNAL_ORG for org-less (internal) events.
		orgIds: jsonb('org_ids').$type<string[] | null>(),
		projectIds: jsonb('project_ids').$type<string[] | null>(),
		assigneeUserId: text('assignee_user_id').references(() => user.id, { onDelete: 'set null' }),
		includeInternalMessages: boolean('include_internal_messages').notNull().default(false),
		enabled: boolean('enabled').notNull().default(true),
		disabledReason: text('disabled_reason').$type<WebhookDisabledReason>(),
		// Exhausted deliveries in a row; reset on any 2xx. Drives auto-disable.
		consecutiveFailures: integer('consecutive_failures').notNull().default(0),
		lastSuccessAt: timestamp('last_success_at'),
		lastFailureAt: timestamp('last_failure_at'),
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull()
	},
	(t) => [index('webhook_subscription_enabled_idx').on(t.enabled)]
);

export type WebhookSubscription = typeof webhookSubscription.$inferSelect;

export const webhookEvent = pgTable(
	'webhook_event',
	{
		id: text('id').primaryKey(),
		type: text('type').notNull(),
		orgId: text('org_id'),
		projectId: text('project_id'),
		actorId: text('actor_id'),
		// The exact JSON body sent to receivers. Stored serialised so the
		// signature the worker computes matches byte-for-byte what it sends.
		payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(t) => [index('webhook_event_created_idx').on(t.createdAt)]
);

export type WebhookEvent = typeof webhookEvent.$inferSelect;

export const webhookDelivery = pgTable(
	'webhook_delivery',
	{
		id: text('id').primaryKey(),
		subscriptionId: text('subscription_id')
			.notNull()
			.references(() => webhookSubscription.id, { onDelete: 'cascade' }),
		eventId: text('event_id')
			.notNull()
			.references(() => webhookEvent.id, { onDelete: 'cascade' }),
		status: text('status').$type<WebhookDeliveryStatus>().notNull().default('pending'),
		attempt: integer('attempt').notNull().default(0),
		nextAttemptAt: timestamp('next_attempt_at'),
		lastStatusCode: integer('last_status_code'),
		lastError: text('last_error'),
		lastDurationMs: integer('last_duration_ms'),
		responseSnippet: text('response_snippet'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull()
	},
	(t) => [
		index('webhook_delivery_sub_created_idx').on(t.subscriptionId, t.createdAt),
		index('webhook_delivery_status_next_idx').on(t.status, t.nextAttemptAt),
		index('webhook_delivery_event_idx').on(t.eventId)
	]
);

export type WebhookDelivery = typeof webhookDelivery.$inferSelect;

export const webhookDeliveryAttempt = pgTable(
	'webhook_delivery_attempt',
	{
		id: text('id').primaryKey(),
		deliveryId: text('delivery_id')
			.notNull()
			.references(() => webhookDelivery.id, { onDelete: 'cascade' }),
		attempt: integer('attempt').notNull(),
		statusCode: integer('status_code'),
		error: text('error'),
		durationMs: integer('duration_ms').notNull().default(0),
		requestHeaders: jsonb('request_headers').$type<Record<string, string>>(),
		responseSnippet: text('response_snippet'),
		at: timestamp('at').defaultNow().notNull()
	},
	(t) => [index('webhook_delivery_attempt_delivery_idx').on(t.deliveryId, t.attempt)]
);

export type WebhookDeliveryAttempt = typeof webhookDeliveryAttempt.$inferSelect;

export const webhookSubscriptionRelations = relations(webhookSubscription, ({ one, many }) => ({
	assignee: one(user, { fields: [webhookSubscription.assigneeUserId], references: [user.id] }),
	creator: one(user, { fields: [webhookSubscription.createdBy], references: [user.id] }),
	deliveries: many(webhookDelivery)
}));

export const webhookEventRelations = relations(webhookEvent, ({ many }) => ({
	deliveries: many(webhookDelivery)
}));

export const webhookDeliveryRelations = relations(webhookDelivery, ({ one, many }) => ({
	subscription: one(webhookSubscription, {
		fields: [webhookDelivery.subscriptionId],
		references: [webhookSubscription.id]
	}),
	event: one(webhookEvent, { fields: [webhookDelivery.eventId], references: [webhookEvent.id] }),
	attempts: many(webhookDeliveryAttempt)
}));

export const webhookDeliveryAttemptRelations = relations(webhookDeliveryAttempt, ({ one }) => ({
	delivery: one(webhookDelivery, {
		fields: [webhookDeliveryAttempt.deliveryId],
		references: [webhookDelivery.id]
	})
}));

// ─── API keys ──────────────────────────────────────────────────────────────
// Personal access tokens for the /api/v1 JSON surface. A key is bound to a
// user and carries exactly that user's permissions — resolving it in
// hooks.server.ts populates `locals.user` / `locals.memberships` the same way a
// session would, so no route or `can()` check knows the difference. Only a
// SHA-256 hash is stored; the plaintext (`trk_…`) is shown once at creation.
// Keys are minted by admins for any user they may manage (see $lib/roles
// `canManageTarget`) and never authenticate anything outside /api/v1.

export const apiKey = pgTable(
	'api_key',
	{
		id: text('id').primaryKey(),
		// Whose permissions the key exercises. Deleting the user kills the key.
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		name: text('name').notNull(),
		// "trk_ab12cd34" — enough to recognise a key in the UI, useless to auth with.
		keyPrefix: text('key_prefix').notNull(),
		keyHash: text('key_hash').notNull(),
		expiresAt: timestamp('expires_at'),
		lastUsedAt: timestamp('last_used_at'),
		revokedAt: timestamp('revoked_at'),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(t) => [uniqueIndex('api_key_hash_idx').on(t.keyHash), index('api_key_user_idx').on(t.userId)]
);

export type ApiKey = typeof apiKey.$inferSelect;

// ─── MCP access ────────────────────────────────────────────────────────────
// Per-user allow-list for the MCP endpoint (/api/mcp). Row present = the user
// may connect an MCP client, whether via an OAuth token (better-auth `mcp`
// plugin) or a `trk_` API key. Enforced on every MCP request and before an
// OAuth authorization code is issued. Managed by admins under
// /admin/settings/mcp; permissions inside MCP are the user's own.

export const mcpAccess = pgTable('mcp_access', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	enabledById: text('enabled_by_id').references(() => user.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

export type McpAccess = typeof mcpAccess.$inferSelect;
