// Fire-and-forget endpoint to mark notifications read. Supports four shapes,
// all scoped to the current user:
//   { all: true }              — mark every unread notification read
//   { id }                     — mark a single notification read (bell/inbox click)
//   { entityType, entityId }   — mark all notifications for an entity, id known
//   { entityType, displayId }  — mark all notifications for an entity by display id
//
// The entity forms are used by clients that open an entity where the read
// should clear on view. IMPORTANT: this must never be called from a server
// `load` — loads run during hover-preloading, which would mark things read on
// hover. Call it from a client effect on mount instead. The displayId form
// resolves the real id server-side (e.g. `TRACKR-12`) so task clients don't
// need the UUID; the entityId form is for clients that already hold the id.

import { json } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { project, task } from '$lib/server/db/app.schema';
import { markAllRead, markEntityRead, markRead } from '$lib/server/notify';
import type { RequestHandler } from './$types';

const ALLOWED_TYPES = new Set(['task', 'ticket']);

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ message: 'Not authenticated' }, { status: 401 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ message: 'Invalid JSON' }, { status: 400 });
	}
	const { all, id, entityType, entityId, displayId } = (body ?? {}) as {
		all?: boolean;
		id?: string;
		entityType?: string;
		entityId?: string;
		displayId?: string;
	};

	if (all === true) {
		await markAllRead(locals.user.id);
		return json({ ok: true });
	}

	if (typeof id === 'string' && id) {
		await markRead(locals.user.id, id);
		return json({ ok: true });
	}

	if (!entityType || !ALLOWED_TYPES.has(entityType)) {
		return json({ message: 'Invalid entityType' }, { status: 400 });
	}

	// Direct id form — clients that already know the entity's real id (e.g. the
	// ticket detail page uses its route param).
	if (typeof entityId === 'string' && entityId) {
		await markEntityRead(locals.user.id, entityType, entityId);
		return json({ ok: true });
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
			.where(and(eq(project.key, key), eq(task.number, number), isNull(task.deletedAt)))
			.limit(1);
		if (!row) return json({ ok: true });
		await markEntityRead(locals.user.id, 'task', row.id);
	}

	return json({ ok: true });
};
