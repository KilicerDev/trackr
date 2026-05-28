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
		parentId: text('parent_id').references((): AnyPgColumn => task.id, { onDelete: 'set null' }),
		dueDate: timestamp('due_date'),
		startDate: timestamp('start_date'),
		endDate: timestamp('end_date'),
		estimateMinutes: integer('estimate_minutes'),
		tags: text('tags').array().notNull().default([]),
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
		index('task_parent_idx').on(t.parentId)
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
	'member.added',
	'member.removed',
	'member.role',
	'lead.set',
	'lead.cleared',
	'task.created',
	'task.status',
	'task.priority',
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

export type NotificationChannelPrefs = { email: boolean; inApp: boolean };
export type NotificationPrefs = Partial<{
	taskAssigned: NotificationChannelPrefs;
	taskMentioned: NotificationChannelPrefs;
	taskCommented: NotificationChannelPrefs;
	taskStatusChanged: NotificationChannelPrefs;
	taskDueSoon: NotificationChannelPrefs;
	ticketCreated: NotificationChannelPrefs;
	ticketAssigned: NotificationChannelPrefs;
	ticketMessage: NotificationChannelPrefs;
	wikiUpdated: NotificationChannelPrefs;
}>;

export const userPreferences = pgTable('user_preferences', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	theme: text('theme').notNull().default('dark'),
	accent: text('accent').notNull().default('#ef7a6d'),
	density: text('density').notNull().default('comfortable'),
	defaultLanding: text('default_landing').notNull().default('/week'),
	weekStartsOn: integer('week_starts_on').notNull().default(1),
	notifications: jsonb('notifications').$type<NotificationPrefs>().notNull().default({}),
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
		assignedAgentId: text('assigned_agent_id').references(() => user.id, { onDelete: 'set null' }),
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		firstResponseAt: timestamp('first_response_at'),
		resolvedAt: timestamp('resolved_at'),
		closedAt: timestamp('closed_at'),
		satisfactionScore: integer('satisfaction_score'),
		tags: text('tags').array().notNull().default([]),
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
		index('ticket_assignee_idx').on(t.assignedAgentId),
		index('ticket_customer_idx').on(t.customerId)
	]
);

export type Ticket = typeof ticket.$inferSelect;

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
	assignedAgent: one(user, {
		fields: [ticket.assignedAgentId],
		references: [user.id],
		relationName: 'ticket_assignee'
	}),
	creator: one(user, {
		fields: [ticket.createdBy],
		references: [user.id],
		relationName: 'ticket_creator'
	}),
	messages: many(ticketMessage)
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

// ─── Notifications ─────────────────────────────────────────────────────────
// Per-recipient inbox. One row = one in-app notification. Email delivery is
// decided by user prefs at emit time and is not represented here. `kind`
// matches `NotificationPrefs` keys. `entityType/entityId` are used to mark
// rows read when the recipient opens the related entity page.

export const NOTIFICATION_KINDS = [
	'taskAssigned',
	'taskMentioned',
	'taskCommented',
	'taskStatusChanged',
	'taskDueSoon',
	'ticketCreated',
	'ticketAssigned',
	'ticketMessage',
	'wikiUpdated'
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
