import { error, fail, type Actions } from '@sveltejs/kit';
import { and, count, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { organization, organizationMember, project } from '$lib/server/db/app.schema';
import { user as userTable } from '$lib/server/db/auth.schema';
import { allowedOrgRoles } from '$lib/roles';
import { recordAudit } from '$lib/server/audit';
import { m } from '$lib/paraglide/messages';
import type { PageServerLoad } from './$types';

// Display labels for the audit log. Best-effort; fall back to the id.
async function orgName(id: string): Promise<string> {
	const [o] = await db
		.select({ name: organization.name })
		.from(organization)
		.where(eq(organization.id, id))
		.limit(1);
	return o?.name ?? id;
}
async function userLabel(id: string): Promise<string> {
	const [u] = await db
		.select({ name: userTable.name, email: userTable.email })
		.from(userTable)
		.where(eq(userTable.id, id))
		.limit(1);
	return u ? (u.name ?? u.email) : id;
}

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
// org.client and org.agent are both top-tier client-org roles (full ticket
// visibility; the agent additionally manages/assigns). An org just needs at
// least one of them, so either satisfies the last-top-role guard.
const TOP_ROLE_FOR_CLIENT = ['org.client', 'org.agent'];

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
	if (!id) throw error(404, m.admin_err_org_not_found());

	const [org] = await db.select().from(organization).where(eq(organization.id, id)).limit(1);
	if (!org) throw error(404, m.admin_err_org_not_found());

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
	if (!row) throw error(404, m.admin_err_org_not_found());
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
	update: async ({ request, params, locals }) => {
		if (!params.id) return fail(400, { message: m.admin_err_missing_org_id() });

		const form = await request.formData();
		const patch: Record<string, unknown> = {};
		if (form.has('name')) {
			const v = String(form.get('name')).trim();
			if (!v) return fail(400, { message: m.admin_err_name_empty() });
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
			const v = String(form.get('slug'))
				.trim()
				.toLowerCase()
				.replace(/[^a-z0-9-]/g, '');
			if (!v) return fail(400, { message: m.admin_err_slug_empty() });
			const [clash] = await db
				.select({ id: organization.id })
				.from(organization)
				.where(eq(organization.slug, v))
				.limit(1);
			if (clash && clash.id !== params.id) {
				return fail(409, { message: m.admin_err_slug_in_use({ slug: v }) });
			}
			patch.slug = v;
		}

		if (Object.keys(patch).length === 0) {
			return fail(400, { message: m.admin_err_nothing_to_update() });
		}

		await db.update(organization).set(patch).where(eq(organization.id, params.id));
		void recordAudit({
			type: 'settings.update',
			actorId: locals.user?.id ?? null,
			targetType: 'org',
			targetId: params.id,
			targetLabel: (patch.name as string | undefined) ?? (await orgName(params.id)),
			orgId: params.id,
			meta: { action: 'org.update', fields: Object.keys(patch) }
		});
		return { success: true };
	},

	archive: async ({ params }) => {
		if (!params.id) return fail(400, { message: m.admin_err_missing_org_id() });
		await db
			.update(organization)
			.set({ archivedAt: new Date() })
			.where(eq(organization.id, params.id));
		return { success: true };
	},

	unarchive: async ({ params }) => {
		if (!params.id) return fail(400, { message: m.admin_err_missing_org_id() });
		await db.update(organization).set({ archivedAt: null }).where(eq(organization.id, params.id));
		return { success: true };
	},

	memberAdd: async ({ request, params, locals }) => {
		if (!params.id) return fail(400, { message: m.admin_err_missing_org_id() });

		const org = await loadOrgOrFail(params.id);
		const allowed = allowedRoles(org.isInternal);

		const form = await request.formData();
		const userId = String(form.get('userId') ?? '').trim();
		// Default to the lowest meaningful role for the org type.
		const requestedRole = String(form.get('role') ?? (org.isInternal ? 'org.staff' : 'org.member'));
		if (!userId) return fail(400, { message: m.admin_err_missing_user() });
		if (!allowed.has(requestedRole)) {
			return fail(400, {
				message: m.admin_err_role_invalid({ role: requestedRole })
			});
		}

		const [u] = await db
			.select({ id: userTable.id })
			.from(userTable)
			.where(eq(userTable.id, userId))
			.limit(1);
		if (!u) return fail(404, { message: m.admin_err_user_not_found() });

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
			return fail(500, { message: m.admin_err_add_member_failed() });
		}
		void recordAudit({
			type: 'user.role_change',
			actorId: locals.user?.id ?? null,
			targetType: 'user',
			targetId: userId,
			targetLabel: await userLabel(userId),
			orgId: params.id,
			meta: { action: 'org.member_add', orgId: params.id, role: requestedRole }
		});
		return { success: true };
	},

	memberSetRole: async ({ request, params, locals }) => {
		if (!params.id) return fail(400, { message: m.admin_err_missing_org_id() });

		const org = await loadOrgOrFail(params.id);
		const allowed = allowedRoles(org.isInternal);

		const form = await request.formData();
		const userId = String(form.get('userId') ?? '').trim();
		const role = String(form.get('role') ?? '');
		if (!userId) return fail(400, { message: m.admin_err_missing_user() });
		if (!allowed.has(role)) {
			return fail(400, {
				message: m.admin_err_role_invalid({ role })
			});
		}

		// Last-admin protection: if we'd be demoting the only top-role holder,
		// refuse. UI should promote someone else first.
		const tops = org.isInternal ? TOP_ROLE_FOR_INTERNAL : TOP_ROLE_FOR_CLIENT;
		if (!tops.includes(role)) {
			const [current] = await db
				.select({ role: organizationMember.role })
				.from(organizationMember)
				.where(and(eq(organizationMember.orgId, params.id), eq(organizationMember.userId, userId)))
				.limit(1);
			if (current && tops.includes(current.role)) {
				const remaining = await countTopRoleHolders(params.id, org.isInternal);
				if (remaining <= 1) {
					return fail(409, {
						message: m.admin_err_last_top_role_demote()
					});
				}
			}
		}

		await db
			.update(organizationMember)
			.set({ role })
			.where(and(eq(organizationMember.orgId, params.id), eq(organizationMember.userId, userId)));
		void recordAudit({
			type: 'user.role_change',
			actorId: locals.user?.id ?? null,
			targetType: 'user',
			targetId: userId,
			targetLabel: await userLabel(userId),
			orgId: params.id,
			meta: { action: 'org.member_role', orgId: params.id, role }
		});
		return { success: true };
	},

	memberRemove: async ({ request, params, locals }) => {
		if (!params.id) return fail(400, { message: m.admin_err_missing_org_id() });

		const org = await loadOrgOrFail(params.id);
		const tops = org.isInternal ? TOP_ROLE_FOR_INTERNAL : TOP_ROLE_FOR_CLIENT;

		const form = await request.formData();
		const userId = String(form.get('userId') ?? '').trim();
		if (!userId) return fail(400, { message: m.admin_err_missing_user() });

		const [current] = await db
			.select({ role: organizationMember.role })
			.from(organizationMember)
			.where(and(eq(organizationMember.orgId, params.id), eq(organizationMember.userId, userId)))
			.limit(1);
		if (!current) return fail(404, { message: m.admin_err_member_not_found() });

		if (tops.includes(current.role)) {
			const remaining = await countTopRoleHolders(params.id, org.isInternal);
			if (remaining <= 1) {
				return fail(409, {
					message: m.admin_err_last_top_role_remove()
				});
			}
		}

		await db
			.delete(organizationMember)
			.where(and(eq(organizationMember.orgId, params.id), eq(organizationMember.userId, userId)));
		void recordAudit({
			type: 'user.role_change',
			actorId: locals.user?.id ?? null,
			targetType: 'user',
			targetId: userId,
			targetLabel: await userLabel(userId),
			orgId: params.id,
			meta: { action: 'org.member_remove', orgId: params.id, role: current.role }
		});
		return { success: true };
	}
};
