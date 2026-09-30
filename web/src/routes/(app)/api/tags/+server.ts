// Tag suggestions for the task and project tag pickers: every tag currently
// in use on the tasks (or projects) the viewer can see, sorted. Fetched by
// the picker when it opens rather than shipped with every page, because
// computing it means scanning the tags column of every live row.
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { project as projectTable, task as taskTable } from '$lib/server/db/app.schema';
import { accessibleProjectIds } from '$lib/server/permissions';
import type { RequestHandler } from './$types';

function sortTags(rows: { tags: string[] }[]): string[] {
	return [...new Set(rows.flatMap((r) => r.tags))].sort((a, b) =>
		a.localeCompare(b, undefined, { sensitivity: 'base' })
	);
}

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) return json({ message: 'Not authenticated' }, { status: 401 });
	const kind = url.searchParams.get('kind');
	if (kind !== 'task' && kind !== 'project') {
		return json({ message: 'kind must be task or project' }, { status: 400 });
	}

	const access = accessibleProjectIds(locals);
	if (!access.all && access.ids.size === 0) return json({ tags: [] });
	const projectFilter = access.all ? undefined : inArray(projectTable.id, [...access.ids]);

	if (kind === 'project') {
		const rows = await db
			.select({ tags: projectTable.tags })
			.from(projectTable)
			.where(and(sql`cardinality(${projectTable.tags}) > 0`, projectFilter));
		return json({ tags: sortTags(rows) });
	}

	const rows = await db
		.select({ tags: taskTable.tags })
		.from(taskTable)
		.innerJoin(projectTable, eq(projectTable.id, taskTable.projectId))
		.where(
			and(
				isNull(taskTable.deletedAt),
				isNull(taskTable.archivedAt),
				ne(projectTable.status, 'archived'),
				sql`cardinality(${taskTable.tags}) > 0`,
				projectFilter
			)
		);
	return json({ tags: sortTags(rows) });
};
