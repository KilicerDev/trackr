// Mark notifications read — same request shapes as the web's
// /api/notifications/read: {all:true} | {id} | {entityType, entityId}.
// (The displayId form is web-only; the app always holds real ids.)
// Never call this from anything that runs on hover/preload.
import { markAllRead, markEntityRead, markRead } from '$lib/server/notify';
import { json, readJson, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

const ALLOWED_TYPES = new Set(['task', 'ticket', 'thread']);

export const POST: RequestHandler = async ({ locals, request }) => {
	const user = requireUser(locals);
	const body = await readJson<{
		all?: boolean;
		id?: string;
		entityType?: string;
		entityId?: string;
	}>(request);

	if (body.all === true) {
		await markAllRead(user.id);
		return json({ ok: true });
	}
	if (typeof body.id === 'string' && body.id) {
		await markRead(user.id, body.id);
		return json({ ok: true });
	}
	if (
		typeof body.entityType === 'string' &&
		ALLOWED_TYPES.has(body.entityType) &&
		typeof body.entityId === 'string' &&
		body.entityId
	) {
		await markEntityRead(user.id, body.entityType, body.entityId);
		return json({ ok: true });
	}
	return json({ error: 'Invalid request shape.' }, { status: 400 });
};
