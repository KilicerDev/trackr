// Fire-and-forget endpoint to mark all notifications for a given entity as
// read. Called from clients that open an entity inline (e.g. the task
// inspector overlay) where there's no dedicated detail route to run the
// mark-read on a server load.
//
// Entity ids are resolved server-side from their display id (e.g.
// `TRACKR-12`) so clients never need to know about UUIDs.

import { json } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { project, task } from '$lib/server/db/app.schema';
import { markEntityRead } from '$lib/server/notify';
import type { RequestHandler } from './$types';

const ALLOWED_TYPES = new Set(['task']);

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ message: 'Not authenticated' }, { status: 401 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ message: 'Invalid JSON' }, { status: 400 });
	}
	const { entityType, displayId } = (body ?? {}) as {
		entityType?: string;
		displayId?: string;
	};

	if (!entityType || !ALLOWED_TYPES.has(entityType)) {
		return json({ message: 'Invalid entityType' }, { status: 400 });
	}
	if (!displayId || typeof displayId !== 'string') {
		return json({ message: 'Missing displayId' }, { status: 400 });
	}

	if (entityType === 'task') {
		const dash = displayId.lastIndexOf('-');
		if (dash < 0) return json({ message: 'Invalid task id' }, { status: 400 });
		const key = displayId.slice(0, dash);
		const number = Number(displayId.slice(dash + 1));
		if (!Number.isFinite(number)) {
			return json({ message: 'Invalid task id' }, { status: 400 });
		}
		const [row] = await db
			.select({ id: task.id })
			.from(task)
			.innerJoin(project, eq(project.id, task.projectId))
			.where(
				and(eq(project.key, key), eq(task.number, number), isNull(task.deletedAt))
			)
			.limit(1);
		if (!row) return json({ ok: true });
		await markEntityRead(locals.user.id, 'task', row.id);
	}

	return json({ ok: true });
};
