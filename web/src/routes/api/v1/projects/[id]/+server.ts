// Read-only project summary — reachable in the app via search only (project
// structuring is a desktop concern).
import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { organization, project, task } from '$lib/server/db/app.schema';
import { assertCan } from '$lib/server/permissions';
import { apiError, json, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	requireUser(locals);
	await assertCan(locals, 'project.tasks.read', { projectId: params.id });

	const [row] = await db
		.select({
			id: project.id,
			key: project.key,
			name: project.name,
			description: project.description,
			color: project.color,
			icon: project.icon,
			status: project.status,
			orgId: project.orgId,
			orgName: organization.name,
			leadId: project.leadId,
			createdAt: project.createdAt,
			updatedAt: project.updatedAt
		})
		.from(project)
		.leftJoin(organization, eq(organization.id, project.orgId))
		.where(eq(project.id, params.id))
		.limit(1);
	if (!row) apiError(404, 'Project not found.');

	const [open] = await db
		.select({ total: count() })
		.from(task)
		.where(and(eq(task.projectId, params.id), isNull(task.deletedAt), isNull(task.archivedAt)));

	return json({
		project: {
			...row,
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt.toISOString(),
			taskCount: Number(open?.total ?? 0)
		}
	});
};
