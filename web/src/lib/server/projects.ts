// Project reads and writes shared by the MCP tools (and available to /api/v1).
// Extracted from the web form actions under routes/(app)/projects/**: the
// permission gates are the same ones those actions assert (`project.create`,
// `project.edit`, `project.tasks.read`), and every write leaves the same
// activity / audit / webhook trail.
//
// Scope: name / key / org / description / colour / status / lead / members.
// Template seeding (the web create modal's `templateId`) is deliberately NOT
// offered here — it is entangled with the modal's transaction and the
// published-template lifecycle; create a bare project and add tasks instead.

import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from './db';
import { organization, project, projectMember, task } from './db/app.schema';
import { user } from './db/auth.schema';
import { accessibleProjectIds, assertCan } from './permissions';
import { loadProjectActivity, type ActivityItem } from './activity/feed';
import { logActivityFF } from './activity';
import { recordAudit } from './audit';
import { emitWebhookEvent, projectSnapshot } from './webhooks';
import { m } from '$lib/paraglide/messages';

export const PROJECT_STATUSES = [
	'prospect',
	'planned',
	'active',
	'paused',
	'completed',
	'cancelled',
	'archived'
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
const PROJECT_STATUS_SET = new Set<string>(PROJECT_STATUSES);

export type ProjectListRow = {
	id: string;
	key: string;
	name: string;
	description: string | null;
	color: string;
	icon: string;
	status: string;
	/** Convenience flag: `status === 'archived'`. */
	archived: boolean;
	orgId: string | null;
	orgKey: string | null;
	orgName: string | null;
	leadId: string | null;
	/** Live (not deleted, not archived) tasks. */
	taskCount: number;
	createdAt: string;
	updatedAt: string;
};

export type ProjectDetail = ProjectListRow & {
	lead: { id: string; name: string } | null;
	members: { id: string; name: string; role: string }[];
	/** Most recent activity feed entries (newest first). */
	activity: ActivityItem[];
};

export type WriteOpts = { origin?: string | null; via?: 'api.v1' | 'mcp' };

function requireActor(locals: App.Locals): NonNullable<App.Locals['user']> {
	if (!locals.user) error(401, 'Not authenticated.');
	return locals.user;
}

/** Same key normalisation as the web create modal: A–Z0–9, max 5 chars. */
export function normalizeProjectKey(raw: string): string {
	return raw
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, '')
		.slice(0, 5);
}

async function liveTaskCounts(projectIds: string[]): Promise<Map<string, number>> {
	const out = new Map<string, number>();
	if (projectIds.length === 0) return out;
	const rows = await db
		.select({ projectId: task.projectId, total: count() })
		.from(task)
		.where(
			and(inArray(task.projectId, projectIds), isNull(task.deletedAt), isNull(task.archivedAt))
		)
		.groupBy(task.projectId);
	for (const r of rows) out.set(r.projectId, Number(r.total));
	return out;
}

const listColumns = {
	id: project.id,
	key: project.key,
	name: project.name,
	description: project.description,
	color: project.color,
	icon: project.icon,
	status: project.status,
	orgId: project.orgId,
	orgKey: organization.key,
	orgName: organization.name,
	leadId: project.leadId,
	createdAt: project.createdAt,
	updatedAt: project.updatedAt
};

function listQuery() {
	return db
		.select(listColumns)
		.from(project)
		.leftJoin(organization, eq(organization.id, project.orgId))
		.$dynamic();
}
type ListSelect = Awaited<ReturnType<typeof listQuery>>[number];

function shapeRow(r: ListSelect, taskCount: number): ProjectListRow {
	return {
		id: r.id,
		key: r.key,
		name: r.name,
		description: r.description,
		color: r.color,
		icon: r.icon,
		status: r.status,
		archived: r.status === 'archived',
		orgId: r.orgId,
		orgKey: r.orgKey,
		orgName: r.orgName,
		leadId: r.leadId,
		taskCount,
		createdAt: r.createdAt.toISOString(),
		updatedAt: r.updatedAt.toISOString()
	};
}

/**
 * Every project the caller may see (internal team: all; others: their
 * project memberships), newest first, with live task counts.
 */
export async function listProjectsFor(locals: App.Locals): Promise<ProjectListRow[]> {
	requireActor(locals);
	const access = accessibleProjectIds(locals);
	if (!access.all && access.ids.size === 0) return [];
	const rows = await listQuery()
		.where(access.all ? undefined : inArray(project.id, [...access.ids]))
		.orderBy(desc(project.createdAt));
	const counts = await liveTaskCounts(rows.map((r) => r.id));
	return rows.map((r) => shapeRow(r, counts.get(r.id) ?? 0));
}

/**
 * One project with lead, members and the most recent activity. Requires
 * `project.tasks.read` (403 otherwise, like the /api/v1 summary); 404 when
 * the id is unknown.
 */
export async function getProjectDetail(
	locals: App.Locals,
	projectId: string,
	opts: { activityLimit?: number } = {}
): Promise<ProjectDetail> {
	requireActor(locals);
	await assertCan(locals, 'project.tasks.read', { projectId });
	const [row] = await listQuery().where(eq(project.id, projectId)).limit(1);
	if (!row) error(404, 'Project not found.');

	const [counts, memberRows, activity] = await Promise.all([
		liveTaskCounts([row.id]),
		db
			.select({ id: projectMember.userId, name: user.name, role: projectMember.role })
			.from(projectMember)
			.innerJoin(user, eq(user.id, projectMember.userId))
			.where(eq(projectMember.projectId, row.id)),
		loadProjectActivity(row.id, { limit: Math.min(opts.activityLimit ?? 20, 200) })
	]);
	let lead: { id: string; name: string } | null = null;
	if (row.leadId) {
		const found = memberRows.find((m) => m.id === row.leadId);
		if (found) lead = { id: found.id, name: found.name };
		else {
			const [u] = await db
				.select({ id: user.id, name: user.name })
				.from(user)
				.where(eq(user.id, row.leadId))
				.limit(1);
			if (u) lead = u;
		}
	}
	return {
		...shapeRow(row, counts.get(row.id) ?? 0),
		lead,
		members: memberRows.map((m) => ({ id: m.id, name: m.name, role: m.role })),
		activity
	};
}

export type CreateProjectInput = {
	name: string;
	key: string;
	description?: string | null;
	/** Client org (uuid) — omit/null for internal work. `orgKey` is an alternative. */
	orgId?: string | null;
	orgKey?: string | null;
	color?: string;
	status?: string;
	leadId?: string | null;
	memberIds?: string[];
};

/**
 * Create a project (`project.create`). Mirrors the web create action minus
 * template seeding: key normalised + unique (409), org validated (400), the
 * creator (and lead) always become members, lead gets `project.manager`.
 * Audit `project.create` + `project.created` webhook.
 */
export async function createProject(
	locals: App.Locals,
	input: CreateProjectInput,
	opts: WriteOpts = {}
): Promise<{ id: string; key: string }> {
	const me = requireActor(locals);
	await assertCan(locals, 'project.create');

	const name = input.name?.trim();
	const key = normalizeProjectKey(input.key ?? '');
	const description = input.description?.trim() || null;
	const color = input.color?.trim() || '#7a9cf0';
	const icon = (name?.trim()[0] ?? 'P').toUpperCase();
	const status = input.status ?? 'active';
	const leadId = input.leadId?.trim() || null;
	const memberIds = (input.memberIds ?? []).map((v) => String(v).trim()).filter(Boolean);

	if (!name) error(400, m.projects_name_required());
	if (!key) error(400, m.projects_key_required());
	if (!PROJECT_STATUS_SET.has(status)) error(400, m.projects_invalid_status());

	const [existing] = await db
		.select({ id: project.id })
		.from(project)
		.where(eq(project.key, key))
		.limit(1);
	if (existing) error(409, m.projects_key_in_use({ key }));

	let orgId: string | null = input.orgId?.trim() || null;
	if (!orgId && input.orgKey?.trim()) {
		const [org] = await db
			.select({ id: organization.id })
			.from(organization)
			.where(eq(organization.key, input.orgKey.trim().toUpperCase()))
			.limit(1);
		if (!org) error(400, m.projects_org_not_exist());
		orgId = org.id;
	} else if (orgId) {
		const [org] = await db
			.select({ id: organization.id })
			.from(organization)
			.where(eq(organization.id, orgId))
			.limit(1);
		if (!org) error(400, m.projects_org_not_exist());
	}

	const wanted = [...new Set([...memberIds, me.id, ...(leadId ? [leadId] : [])])];
	const validUsers = await db.select({ id: user.id }).from(user).where(inArray(user.id, wanted));
	const validIds = new Set(validUsers.map((u) => u.id));
	if (leadId && !validIds.has(leadId)) error(400, m.projects_user_not_found());

	const id = crypto.randomUUID();
	await db.transaction(async (tx) => {
		await tx.insert(project).values({
			id,
			key,
			name,
			description,
			color,
			icon,
			status,
			leadId,
			orgId,
			createdBy: me.id
		});
		await tx.insert(projectMember).values(
			wanted
				.filter((userId) => validIds.has(userId))
				.map((userId) => ({
					projectId: id,
					userId,
					role: userId === leadId ? 'project.manager' : 'project.member'
				}))
		);
	});

	void recordAudit({
		type: 'project.create',
		actorId: me.id,
		targetType: 'project',
		targetId: id,
		targetLabel: name,
		orgId,
		meta: { key, ...(opts.via ? { via: opts.via } : {}) }
	});
	emitWebhookEvent({
		type: 'project.created',
		orgId,
		projectId: id,
		actor: { id: me.id, name: me.name },
		origin: opts.origin ?? null,
		data: { project: projectSnapshot({ id, key, name, orgId, status }, opts.origin ?? null) }
	});
	return { id, key };
}

export type UpdateProjectPatch = {
	name?: string;
	description?: string | null;
	status?: string;
	color?: string;
};

/**
 * Update name / description / status / colour (`project.edit`). Partial: only
 * the given fields change; the icon follows the name's first letter like the
 * web action. Activity rows per changed field + audit `project.update`.
 */
export async function updateProject(
	locals: App.Locals,
	projectId: string,
	patch: UpdateProjectPatch,
	opts: WriteOpts = {}
): Promise<{ changed: boolean }> {
	const me = requireActor(locals);
	await assertCan(locals, 'project.edit', { projectId });

	const [prior] = await db
		.select({
			name: project.name,
			description: project.description,
			status: project.status,
			color: project.color
		})
		.from(project)
		.where(eq(project.id, projectId))
		.limit(1);
	if (!prior) error(404, m.projects_not_found_period());

	const fields: Record<string, unknown> = {};
	let name = prior.name;
	if (patch.name !== undefined) {
		name = String(patch.name).trim();
		if (!name) error(400, m.projects_name_required_edit());
		if (name !== prior.name) {
			fields.name = name;
			fields.icon = (name[0] ?? 'P').toUpperCase();
		}
	}
	if (patch.description !== undefined) {
		const description = String(patch.description ?? '').trim() || null;
		if (description !== prior.description) fields.description = description;
	}
	let status = prior.status;
	if (patch.status !== undefined) {
		status = String(patch.status);
		if (!PROJECT_STATUS_SET.has(status)) error(400, m.projects_invalid_status());
		if (status !== prior.status) fields.status = status;
	}
	let color = prior.color;
	if (patch.color !== undefined && String(patch.color).trim()) {
		color = String(patch.color).trim();
		if (color !== prior.color) fields.color = color;
	}
	if (Object.keys(fields).length === 0) return { changed: false };

	await db
		.update(project)
		.set({ ...fields, updatedAt: new Date() })
		.where(eq(project.id, projectId));

	const actorId = me.id;
	if (fields.name !== undefined) {
		logActivityFF({
			projectId,
			actorId,
			type: 'project.name',
			meta: { from: prior.name, to: name }
		});
	}
	if (fields.description !== undefined) {
		logActivityFF({ projectId, actorId, type: 'project.description' });
	}
	if (fields.status !== undefined) {
		logActivityFF({
			projectId,
			actorId,
			type: 'project.status',
			meta: { from: prior.status, to: status }
		});
	}
	if (fields.color !== undefined) {
		logActivityFF({
			projectId,
			actorId,
			type: 'project.color',
			meta: { from: prior.color, to: color }
		});
	}
	void recordAudit({
		type: 'project.update',
		actorId,
		targetType: 'project',
		targetId: projectId,
		targetLabel: name,
		meta: {
			status,
			statusFrom: prior.status,
			fields: Object.keys(fields),
			...(opts.via ? { via: opts.via } : {})
		}
	});
	return { changed: true };
}
