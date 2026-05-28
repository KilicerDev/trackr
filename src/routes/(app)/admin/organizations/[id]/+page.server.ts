import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import { and, count, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { organization, organizationMember, project } from '$lib/server/db/app.schema';
import { user as userTable } from '$lib/server/db/auth.schema';
import { allowedOrgRoles } from '$lib/roles';
import type { PageServerLoad } from './$types';

// Role IDs assignable on each org type come from the shared helper. Internal-
// only roles (superadmin / admin / staff) belong exclusively to the Trackr
// internal org; client orgs get the two client-side roles. The
// /admin/+layout.server.ts guard already ensured the caller has admin.access.
function allowedRoles(isInternal: boolean): Set<string> {
	return new Set(allowedOrgRoles(isInternal));
}

// Highest role on each org type — used for the "last admin" check that
// prevents leaving an org without anyone holding the top role.
const TOP_ROLE_FOR_INTERNAL = ['org.superadmin', 'org.admin'];
const TOP_ROLE_FOR_CLIENT = ['org.client'];

function initials(name: string): string {
	return (
		name
			.split(/\s+/)
			.map((p) => p[0])
			.filter(Boolean)
			.slice(0, 2)
			.join('')
			.toUpperCase() || '·'
	);
}
function userColor(id: string): string {
	let h = 0;
	for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
	return `hsl(${h % 360} 55% 60%)`;
}

export const load: PageServerLoad = async ({ params }) => {
	const id = params.id;
	if (!id) throw error(404, 'Organization not found');

	const [org] = await db.select().from(organization).where(eq(organization.id, id)).limit(1);
	if (!org) throw error(404, 'Organization not found');

	const projects = await db
		.select({
			id: project.id,
			key: project.key,
			name: project.name,
			color: project.color,
			icon: project.icon,
			status: project.status,
			updatedAt: project.updatedAt
		})
		.from(project)
		.where(eq(project.orgId, id))
		.orderBy(desc(project.updatedAt));

	const memberRows = await db
		.select({
			userId: organizationMember.userId,
			role: organizationMember.role,
			addedAt: organizationMember.addedAt,
			name: userTable.name,
			email: userTable.email
		})
		.from(organizationMember)
		.innerJoin(userTable, eq(userTable.id, organizationMember.userId))
		.where(eq(organizationMember.orgId, id))
		.orderBy(organizationMember.addedAt);

	const members = memberRows.map((m) => ({
		id: m.userId,
		name: m.name,
		email: m.email,
		role: m.role,
		initials: initials(m.name),
		color: userColor(m.userId),
		addedAt: m.addedAt
	}));

	return {
		org: {
			id: org.id,
			slug: org.slug,
			name: org.name,
			description: org.description,
			color: org.color,
			isInternal: org.isInternal,
			archivedAt: org.archivedAt,
			createdAt: org.createdAt,
			updatedAt: org.updatedAt
		},
		projects,
		members,
		allowedRoles: Array.from(allowedRoles(org.isInternal))
	};
};

async function loadOrgOrFail(orgId: string) {
	const [row] = await db
		.select({ id: organization.id, isInternal: organization.isInternal })
		.from(organization)
		.where(eq(organization.id, orgId))
		.limit(1);
	if (!row) throw error(404, 'Organization not found');
	return row;
}

async function countTopRoleHolders(orgId: string, isInternal: boolean): Promise<number> {
	const tops = isInternal ? TOP_ROLE_FOR_INTERNAL : TOP_ROLE_FOR_CLIENT;
	let total = 0;
	for (const r of tops) {
		const [row] = await db
			.select({ total: count() })
			.from(organizationMember)
			.where(and(eq(organizationMember.orgId, orgId), eq(organizationMember.role, r)));
		total += Number(row?.total ?? 0);
	}
	return total;
}

export const actions: Actions = {
	update: async ({ request, params }) => {
		if (!params.id) return fail(400, { message: 'Missing org id.' });

		const form = await request.formData();
		const patch: Record<string, unknown> = {};
		if (form.has('name')) {
			const v = String(form.get('name')).trim();
			if (!v) return fail(400, { message: 'Name cannot be empty.' });
			patch.name = v;
		}
		if (form.has('description')) {
			const v = String(form.get('description'));
			patch.description = v.trim() || null;
		}
		if (form.has('color')) {
			patch.color = String(form.get('color'));
		}
		if (form.has('slug')) {
			const v = String(form.get('slug')).trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
			if (!v) return fail(400, { message: 'Slug cannot be empty.' });
			const [clash] = await db
				.select({ id: organization.id })
				.from(organization)
				.where(eq(organization.slug, v))
				.limit(1);
			if (clash && clash.id !== params.id) {
				return fail(409, { message: `Slug "${v}" is already in use.` });
			}
			patch.slug = v;
		}

		if (Object.keys(patch).length === 0) {
			return fail(400, { message: 'Nothing to update.' });
		}

		await db.update(organization).set(patch).where(eq(organization.id, params.id));
		return { success: true };
	},

	archive: async ({ params }) => {
		if (!params.id) return fail(400, { message: 'Missing org id.' });
		await db
			.update(organization)
			.set({ archivedAt: new Date() })
			.where(eq(organization.id, params.id));
		return { success: true };
	},

	unarchive: async ({ params }) => {
		if (!params.id) return fail(400, { message: 'Missing org id.' });
		await db
			.update(organization)
			.set({ archivedAt: null })
			.where(eq(organization.id, params.id));
		return { success: true };
	},

	memberAdd: async ({ request, params }) => {
		if (!params.id) return fail(400, { message: 'Missing org id.' });

		const org = await loadOrgOrFail(params.id);
		const allowed = allowedRoles(org.isInternal);

		const form = await request.formData();
		const userId = String(form.get('userId') ?? '').trim();
		// Default to the lowest meaningful role for the org type.
		const requestedRole = String(
			form.get('role') ?? (org.isInternal ? 'org.staff' : 'org.member')
		);
		if (!userId) return fail(400, { message: 'Missing user.' });
		if (!allowed.has(requestedRole)) {
			return fail(400, {
				message: `Role "${requestedRole}" is not valid on this organization.`
			});
		}

		const [u] = await db
			.select({ id: userTable.id })
			.from(userTable)
			.where(eq(userTable.id, userId))
			.limit(1);
		if (!u) return fail(404, { message: 'User not found.' });

		try {
			await db
				.insert(organizationMember)
				.values({ orgId: params.id, userId, role: requestedRole })
				.onConflictDoUpdate({
					target: [organizationMember.orgId, organizationMember.userId],
					set: { role: requestedRole }
				});
		} catch (err) {
			console.error('memberAdd failed', err);
			return fail(500, { message: 'Failed to add member.' });
		}
		return { success: true };
	},

	memberSetRole: async ({ request, params }) => {
		if (!params.id) return fail(400, { message: 'Missing org id.' });

		const org = await loadOrgOrFail(params.id);
		const allowed = allowedRoles(org.isInternal);

		const form = await request.formData();
		const userId = String(form.get('userId') ?? '').trim();
		const role = String(form.get('role') ?? '');
		if (!userId) return fail(400, { message: 'Missing user.' });
		if (!allowed.has(role)) {
			return fail(400, {
				message: `Role "${role}" is not valid on this organization.`
			});
		}

		// Last-admin protection: if we'd be demoting the only top-role holder,
		// refuse. UI should promote someone else first.
		const tops = org.isInternal ? TOP_ROLE_FOR_INTERNAL : TOP_ROLE_FOR_CLIENT;
		if (!tops.includes(role)) {
			const [current] = await db
				.select({ role: organizationMember.role })
				.from(organizationMember)
				.where(
					and(
						eq(organizationMember.orgId, params.id),
						eq(organizationMember.userId, userId)
					)
				)
				.limit(1);
			if (current && tops.includes(current.role)) {
				const remaining = await countTopRoleHolders(params.id, org.isInternal);
				if (remaining <= 1) {
					return fail(409, {
						message: 'This is the last top-role holder — promote someone else first.'
					});
				}
			}
		}

		await db
			.update(organizationMember)
			.set({ role })
			.where(
				and(eq(organizationMember.orgId, params.id), eq(organizationMember.userId, userId))
			);
		return { success: true };
	},

	memberRemove: async ({ request, params }) => {
		if (!params.id) return fail(400, { message: 'Missing org id.' });

		const org = await loadOrgOrFail(params.id);
		const tops = org.isInternal ? TOP_ROLE_FOR_INTERNAL : TOP_ROLE_FOR_CLIENT;

		const form = await request.formData();
		const userId = String(form.get('userId') ?? '').trim();
		if (!userId) return fail(400, { message: 'Missing user.' });

		const [current] = await db
			.select({ role: organizationMember.role })
			.from(organizationMember)
			.where(
				and(eq(organizationMember.orgId, params.id), eq(organizationMember.userId, userId))
			)
			.limit(1);
		if (!current) return fail(404, { message: 'Member not found.' });

		if (tops.includes(current.role)) {
			const remaining = await countTopRoleHolders(params.id, org.isInternal);
			if (remaining <= 1) {
				return fail(409, {
					message: 'Cannot remove the last top-role holder. Promote another member first.'
				});
			}
		}

		await db
			.delete(organizationMember)
			.where(
				and(eq(organizationMember.orgId, params.id), eq(organizationMember.userId, userId))
			);
		return { success: true };
	}
};
