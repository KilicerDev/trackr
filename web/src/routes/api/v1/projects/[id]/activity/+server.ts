// Project history feed for the mobile app — the same rows the web's history
// drawer shows (`loadProjectActivity`), but with each typed event already
// rendered to a plain-text line so the app doesn't have to duplicate the
// per-type templating. POST adds a project-level comment (web `?/commentAdd`).
import { eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { project, projectActivity } from '$lib/server/db/app.schema';
import { user as userTable } from '$lib/server/db/auth.schema';
import { loadProjectActivity, type ActivityItem } from '$lib/server/activity/feed';
import { notifyProjectComment } from '$lib/server/notify/events/project';
import { assertCan } from '$lib/server/permissions';
import { apiError, json, readJson, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

function humanize(v: unknown): string {
	return String(v ?? '').replace(/[._]/g, ' ');
}
function roleLabel(v: unknown): string {
	const id = String(v ?? '');
	const last = id.includes('.') ? id.slice(id.lastIndexOf('.') + 1) : id;
	return last.charAt(0).toUpperCase() + last.slice(1);
}
function fmtMinutes(min: unknown): string {
	const n = Number(min) || 0;
	const h = Math.floor(n / 60);
	const m = n % 60;
	return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}
function taskRef(meta: Record<string, unknown> | null): string {
	return meta && typeof meta.taskRef === 'string' ? meta.taskRef : 'a task';
}

// Mirrors the `line` snippet in ProjectHistory.svelte (English only — the
// app has no locale switch yet). Comments return their body unchanged.
function describe(e: ActivityItem, userName: (id: unknown) => string): string {
	const meta = e.meta;
	switch (e.type) {
		case 'comment':
			return e.body ?? '';
		case 'task.created':
			return `created ${taskRef(meta)}`;
		case 'task.deleted':
			return `deleted ${taskRef(meta)}`;
		case 'task.status':
			return `changed status of ${taskRef(meta)} ${humanize(meta?.from)} → ${humanize(meta?.to)}`;
		case 'task.priority':
			return `changed priority of ${taskRef(meta)} ${humanize(meta?.from)} → ${humanize(meta?.to)}`;
		case 'task.type':
			return `changed type of ${taskRef(meta)} ${humanize(meta?.from)} → ${humanize(meta?.to)}`;
		case 'task.assignee':
			return `updated assignees of ${taskRef(meta)}`;
		case 'time.logged':
			return `logged ${fmtMinutes(meta?.minutes)} on ${taskRef(meta)}`;
		case 'project.name':
			return `renamed the project to ${humanize(meta?.to)}`;
		case 'project.description':
			return 'updated the description';
		case 'project.status':
			return `changed status${meta?.from ? ` from ${humanize(meta.from)}` : ''} to ${humanize(meta?.to)}`;
		case 'project.color':
			return 'changed the color';
		case 'member.added':
			return `added ${userName(meta?.userId)} as ${roleLabel(meta?.role)}`;
		case 'member.removed':
			return `removed ${userName(meta?.userId)}`;
		case 'member.role':
			return `changed ${userName(meta?.userId)}'s role to ${roleLabel(meta?.role)}`;
		case 'lead.set':
			return `set ${userName(meta?.userId)} as lead`;
		case 'lead.cleared':
			return 'cleared the lead';
		default:
			return humanize(e.type);
	}
}

export const GET: RequestHandler = async ({ locals, params, url }) => {
	requireUser(locals);
	await assertCan(locals, 'project.tasks.read', { projectId: params.id });

	const offsetRaw = Number(url.searchParams.get('offset') ?? 0);
	const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0;
	const items = await loadProjectActivity(params.id, { limit: 50, offset });

	// Member/lead events reference users by id in `meta` — resolve names once.
	const referenced = new Set<string>();
	for (const it of items) {
		const id = it.meta?.userId;
		if (typeof id === 'string' && id) referenced.add(id);
	}
	const names = new Map<string, string>();
	if (referenced.size > 0) {
		const rows = await db
			.select({ id: userTable.id, name: userTable.name })
			.from(userTable)
			.where(inArray(userTable.id, [...referenced]));
		for (const r of rows) names.set(r.id, r.name);
	}
	const userName = (id: unknown) => (typeof id === 'string' ? (names.get(id) ?? '—') : '—');

	return json({
		items: items.map((it) => ({
			id: it.id,
			type: it.type,
			taskId: it.taskId,
			taskRef: typeof it.meta?.taskRef === 'string' ? it.meta.taskRef : null,
			text: describe(it, userName),
			createdAt: it.createdAt,
			actor: it.actor
		}))
	});
};

export const POST: RequestHandler = async ({ locals, params, request, url }) => {
	const user = requireUser(locals);
	await assertCan(locals, 'project.tasks.read', { projectId: params.id });

	const payload = await readJson<{ body?: string }>(request);
	const body = payload.body?.trim() ?? '';
	if (!body) apiError(400, 'body is required.');

	const [proj] = await db
		.select({ name: project.name, orgId: project.orgId })
		.from(project)
		.where(eq(project.id, params.id))
		.limit(1);
	if (!proj) apiError(404, 'Project not found.');

	const id = crypto.randomUUID();
	await db.insert(projectActivity).values({
		id,
		projectId: params.id,
		actorId: user.id,
		type: 'comment',
		body
	});

	void notifyProjectComment({
		projectId: params.id,
		projectName: proj.name,
		orgId: proj.orgId ?? null,
		body,
		actor: { id: user.id, name: user.name },
		origin: url.origin
	}).catch((err) => console.error('project comment mention notify failed', err));

	return json({ id }, { status: 201 });
};
