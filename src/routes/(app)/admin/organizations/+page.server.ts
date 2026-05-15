import { error, fail, redirect, type Actions } from '@sveltejs/kit';
import { count, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { organization, organizationMember, project } from '$lib/server/db/app.schema';
import { isAdminLike } from '$lib/roles';
import type { PageServerLoad } from './$types';

function roleOf(u: unknown): string | null | undefined {
	return (u as { role?: string | null } | undefined)?.role;
}

function slugify(input: string): string {
	return input
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48);
}

export interface OrgRow {
	id: string;
	slug: string;
	name: string;
	description: string | null;
	color: string;
	createdAt: Date;
	updatedAt: Date;
	archivedAt: Date | null;
	projectCount: number;
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/sign-in');
	if (!isAdminLike(roleOf(locals.user))) redirect(303, '/');

	const rows = await db
		.select({
			id: organization.id,
			slug: organization.slug,
			name: organization.name,
			description: organization.description,
			color: organization.color,
			createdAt: organization.createdAt,
			updatedAt: organization.updatedAt,
			archivedAt: organization.archivedAt
		})
		.from(organization)
		.orderBy(organization.name);

	// Fan out a single counts query rather than N+1 per org.
	const counts = await db
		.select({ orgId: project.orgId, total: count() })
		.from(project)
		.where(isNull(project.archivedAt))
		.groupBy(project.orgId);
	const countByOrg = new Map<string, number>();
	for (const c of counts) {
		if (c.orgId) countByOrg.set(c.orgId, Number(c.total));
	}

	const orgs: OrgRow[] = rows.map((r) => ({ ...r, projectCount: countByOrg.get(r.id) ?? 0 }));
	return { orgs };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Not authenticated');
		if (!isAdminLike(roleOf(locals.user))) throw error(403, 'Admins only');

		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		let slug = String(form.get('slug') ?? '').trim();
		const description = String(form.get('description') ?? '').trim() || null;
		const color = String(form.get('color') ?? '#7a9cf0');

		if (!name) return fail(400, { message: 'Name is required.' });
		if (!slug) slug = slugify(name);
		if (!slug) return fail(400, { message: 'Slug could not be derived from the name.' });

		const [existing] = await db
			.select({ id: organization.id })
			.from(organization)
			.where(eq(organization.slug, slug))
			.limit(1);
		if (existing) return fail(409, { message: `Slug "${slug}" is already in use.` });

		const id = crypto.randomUUID();
		const me = locals.user;
		await db.transaction(async (tx) => {
			await tx.insert(organization).values({
				id,
				slug,
				name,
				description,
				color,
				createdBy: me.id
			});
			await tx.insert(organizationMember).values({
				orgId: id,
				userId: me.id,
				role: 'owner'
			});
		});

		return { success: true, id, slug };
	}
};
