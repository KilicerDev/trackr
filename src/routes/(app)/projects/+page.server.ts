import { error, fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import { eq, desc, isNull, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	project,
	projectMember,
	organization,
	type Project
} from '$lib/server/db/app.schema';
import { user } from '$lib/server/db/auth.schema';
import { accessibleProjectIds, assertCan } from '$lib/server/permissions';

interface MemberSummary {
	id: string;
	name: string;
	initials: string;
	color: string;
}

export interface ProjectListItem {
	id: string;
	key: string;
	name: string;
	description: string | null;
	color: string;
	icon: string;
	status: Project['status'];
	updatedAt: Date;
	archivedAt: Date | null;
	lead: MemberSummary | null;
	members: MemberSummary[];
	org: { id: string; name: string; slug: string } | null;
}

function initials(name: string): string {
	return name
		.split(/\s+/)
		.map((p) => p[0])
		.filter(Boolean)
		.slice(0, 2)
		.join('')
		.toUpperCase();
}

function userColor(id: string): string {
	let h = 0;
	for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
	return `hsl(${h % 360} 55% 60%)`;
}

function summarize(u: { id: string; name: string }): MemberSummary {
	return { id: u.id, name: u.name, initials: initials(u.name), color: userColor(u.id) };
}

function normalizeKey(raw: string): string {
	return raw
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, '')
		.slice(0, 5);
}

export const load: ServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/sign-in');

	// Trackr internal team sees every project; everyone else only sees rows
	// they're a project_member of.
	const access = accessibleProjectIds(locals);
	if (!access.all && access.ids.size === 0) {
		return { projectsList: [], archivedProjectsList: [], orgs: [] };
	}
	const accessFilter = access.all ? undefined : inArray(project.id, [...access.ids]);

	// Load both active and archived; partition below so the page can render
	// either set under tabs without re-querying.
	const rows = await db
		.select({
			id: project.id,
			key: project.key,
			name: project.name,
			description: project.description,
			color: project.color,
			icon: project.icon,
			status: project.status,
			leadId: project.leadId,
			orgId: project.orgId,
			updatedAt: project.updatedAt,
			archivedAt: project.archivedAt
		})
		.from(project)
		.where(accessFilter)
		.orderBy(desc(project.updatedAt));

	const projectIds = rows.map((r) => r.id);
	const leadIds = rows.map((r) => r.leadId).filter((x): x is string => !!x);
	const orgIds = rows.map((r) => r.orgId).filter((x): x is string => !!x);

	const memberRows = projectIds.length
		? await db
				.select({
					projectId: projectMember.projectId,
					userId: projectMember.userId,
					name: user.name
				})
				.from(projectMember)
				.innerJoin(user, eq(user.id, projectMember.userId))
				.where(inArray(projectMember.projectId, projectIds))
		: [];

	const leadRows = leadIds.length
		? await db
				.select({ id: user.id, name: user.name })
				.from(user)
				.where(inArray(user.id, leadIds))
		: [];

	const orgRows = orgIds.length
		? await db
				.select({ id: organization.id, name: organization.name, slug: organization.slug })
				.from(organization)
				.where(inArray(organization.id, orgIds))
		: [];

	const leadById = new Map(leadRows.map((u) => [u.id, summarize(u)]));
	const orgById = new Map(orgRows.map((o) => [o.id, o]));
	const membersByProject = new Map<string, MemberSummary[]>();
	for (const m of memberRows) {
		const list = membersByProject.get(m.projectId) ?? [];
		list.push(summarize({ id: m.userId, name: m.name }));
		membersByProject.set(m.projectId, list);
	}

	const all: ProjectListItem[] = rows.map((r) => ({
		id: r.id,
		key: r.key,
		name: r.name,
		description: r.description,
		color: r.color,
		icon: r.icon,
		status: r.status as Project['status'],
		updatedAt: r.updatedAt,
		archivedAt: r.archivedAt,
		lead: r.leadId ? (leadById.get(r.leadId) ?? null) : null,
		members: membersByProject.get(r.id) ?? [],
		org: r.orgId ? (orgById.get(r.orgId) ?? null) : null
	}));

	// Renamed from `projects`/`archivedProjects` to avoid colliding with the
	// (app) layout fields of the same name — `page.data` merges layout + page
	// loads, so identical keys would override the layout's name-sorted list
	// and reshuffle the sidebar's favorites order on this route.
	const projectsList = all.filter((p) => !p.archivedAt);
	const archivedProjectsList = all.filter((p) => !!p.archivedAt);

	// Active orgs for the create-project modal's org picker.
	const orgsForPicker = await db
		.select({
			id: organization.id,
			name: organization.name,
			slug: organization.slug,
			color: organization.color
		})
		.from(organization)
		.where(isNull(organization.archivedAt))
		.orderBy(organization.name);

	return { projectsList, archivedProjectsList, orgs: orgsForPicker };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Not authenticated');
		await assertCan(locals, 'project.create');
		const me = locals.user;

		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const key = normalizeKey(String(form.get('key') ?? ''));
		const description = String(form.get('description') ?? '').trim() || null;
		const color = String(form.get('color') ?? '#7a9cf0');
		const icon = (String(form.get('icon') ?? '').trim()[0] ?? 'P').toUpperCase();
		const status = String(form.get('status') ?? 'on_track') as Project['status'];
		const leadId = String(form.get('lead') ?? '') || null;
		const orgId = String(form.get('orgId') ?? '').trim() || null;
		const memberIds = form.getAll('members').map((v) => String(v)).filter(Boolean);

		if (!name) return fail(400, { message: 'Name is required.' });
		if (!key) return fail(400, { message: 'Key is required.' });

		const [existing] = await db.select({ id: project.id }).from(project).where(eq(project.key, key)).limit(1);
		if (existing) return fail(409, { message: `Project key "${key}" is already in use.` });

		// Validate org id (if provided) actually points at an existing row.
		if (orgId) {
			const [org] = await db
				.select({ id: organization.id })
				.from(organization)
				.where(eq(organization.id, orgId))
				.limit(1);
			if (!org) return fail(400, { message: 'Selected organization does not exist.' });
		}

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

			const memberSet = new Set<string>(memberIds);
			memberSet.add(me.id);
			if (leadId) memberSet.add(leadId);

			await tx.insert(projectMember).values(
				[...memberSet].map((userId) => ({
					projectId: id,
					userId,
					role: userId === leadId ? 'project.manager' : 'project.member'
				}))
			);
		});

		return { success: true, id };
	}
};
