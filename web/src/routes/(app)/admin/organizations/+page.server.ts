import { fail, type Actions } from '@sveltejs/kit';
import { count, eq, ne } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { organization, project } from '$lib/server/db/app.schema';
import { recordAudit } from '$lib/server/audit';
import { m } from '$lib/paraglide/messages';
import type { PageServerLoad } from './$types';

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

export const load: PageServerLoad = async () => {
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
		.where(ne(project.status, 'archived'))
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
		// Layout loads don't run for action POSTs, so the /admin layout gate does
		// not protect this — the caller must be re-checked here (the hooks.server.ts
		// admin guard covers it too; this stays as defense in depth). New orgs
		// start empty — Trackr-team users have access via their internal-org
		// role, so we no longer auto-add the creator as a member.
		if (!locals.user) return fail(401, { message: m.admin_err_not_authenticated() });
		if (!locals.isAdmin) return fail(403, { message: m.admin_err_admin_required() });

		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		let slug = String(form.get('slug') ?? '').trim();
		const description = String(form.get('description') ?? '').trim() || null;
		const color = String(form.get('color') ?? '#7a9cf0');

		if (!name) return fail(400, { message: m.admin_err_name_required() });
		if (!slug) slug = slugify(name);
		if (!slug) return fail(400, { message: m.admin_err_slug_underivable() });

		const [existing] = await db
			.select({ id: organization.id })
			.from(organization)
			.where(eq(organization.slug, slug))
			.limit(1);
		if (existing) return fail(409, { message: m.admin_err_slug_in_use({ slug }) });

		const id = crypto.randomUUID();
		await db.insert(organization).values({
			id,
			slug,
			name,
			description,
			color,
			createdBy: locals.user.id
		});

		void recordAudit({
			type: 'settings.update',
			actorId: locals.user.id,
			targetType: 'org',
			targetId: id,
			targetLabel: name,
			orgId: id,
			meta: { action: 'org.create', slug }
		});

		return { success: true, id, slug };
	}
};
