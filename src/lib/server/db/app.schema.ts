import { relations } from 'drizzle-orm';
import {
	pgTable,
	text,
	integer,
	timestamp,
	date,
	index,
	uniqueIndex,
	primaryKey,
	type AnyPgColumn
} from 'drizzle-orm/pg-core';
import { user } from './auth.schema';

export const invitation = pgTable(
	'invitation',
	{
		id: text('id').primaryKey(),
		email: text('email').notNull().unique(),
		name: text('name').notNull(),
		role: text('role').notNull().default('user'),
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
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		archivedAt: timestamp('archived_at'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull()
	},
	(t) => [uniqueIndex('organization_slug_idx').on(t.slug)]
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
		status: text('status').notNull().default('on_track'),
		orgId: text('org_id').references(() => organization.id, { onDelete: 'set null' }),
		leadId: text('lead_id').references(() => user.id, { onDelete: 'set null' }),
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		nextTaskNumber: integer('next_task_number').notNull().default(1),
		archivedAt: timestamp('archived_at'),
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

// ─── Task comments ─────────────────────────────────────────────────────────

export const taskComment = pgTable(
	'task_comment',
	{
		id: text('id').primaryKey(),
		taskId: text('task_id')
			.notNull()
			.references(() => task.id, { onDelete: 'cascade' }),
		authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
		body: text('body').notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull()
	},
	(t) => [index('task_comment_task_idx').on(t.taskId, t.createdAt)]
);

export type TaskComment = typeof taskComment.$inferSelect;

export const taskCommentRelations = relations(taskComment, ({ one }) => ({
	task: one(task, {
		fields: [taskComment.taskId],
		references: [task.id]
	}),
	author: one(user, {
		fields: [taskComment.authorId],
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
