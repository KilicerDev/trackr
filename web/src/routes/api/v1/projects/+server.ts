// Project list for the app — the same access scoping and row shape as the web
// /projects page (internal team sees everything, others their memberships),
// trimmed to display fields. Read-only: project structuring stays on desktop.
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { project, projectMember } from '$lib/server/db/app.schema';
import { user } from '$lib/server/db/auth.schema';
import { accessibleProjectIds } from '$lib/server/permissions';
import { json, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	requireUser(locals);

	const access = accessibleProjectIds(locals);
	if (!access.all && access.ids.size === 0) return json({ projects: [] });
	const accessFilter = access.all ? undefined : inArray(project.id, [...access.ids]);

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
			updatedAt: project.updatedAt
		})
		.from(project)
		.where(accessFilter)
		.orderBy(desc(project.createdAt));

	const projectIds = rows.map((r) => r.id);
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
	const membersByProject = new Map<string, { id: string; name: string }[]>();
	for (const m of memberRows) {
		const list = membersByProject.get(m.projectId) ?? [];
		list.push({ id: m.userId, name: m.name });
		membersByProject.set(m.projectId, list);
	}

	return json({
		projects: rows.map((r) => ({
			id: r.id,
			key: r.key,
			name: r.name,
			description: r.description,
			color: r.color,
			icon: r.icon,
			status: r.status,
			leadId: r.leadId,
			members: membersByProject.get(r.id) ?? [],
			updatedAt: r.updatedAt.toISOString()
		}))
	});
};
