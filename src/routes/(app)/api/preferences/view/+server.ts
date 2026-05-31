import { json } from '@sveltejs/kit';
import { upsertPreferences, getPreferences } from '$lib/server/preferences';
import type { RequestHandler } from './$types';

const ALLOWED_KEYS = new Set(['tasks', 'projects', 'week', 'tickets', 'wiki', 'portal']);
const MAX_BYTES = 8 * 1024;

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ message: 'Not authenticated' }, { status: 401 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ message: 'Invalid JSON' }, { status: 400 });
	}
	const { key, patch } = (body ?? {}) as { key?: string; patch?: unknown };

	if (!key || !ALLOWED_KEYS.has(key)) {
		return json({ message: 'Invalid key' }, { status: 400 });
	}
	if (patch == null || typeof patch !== 'object' || Array.isArray(patch)) {
		return json({ message: 'Patch must be an object' }, { status: 400 });
	}
	const serialized = JSON.stringify(patch);
	if (serialized.length > MAX_BYTES) {
		return json({ message: 'Patch too large' }, { status: 413 });
	}

	const existing = await getPreferences(locals.user.id);
	const prevForKey = (existing.viewState[key] ?? {}) as Record<string, unknown>;
	const merged = { ...existing.viewState, [key]: { ...prevForKey, ...(patch as object) } };

	await upsertPreferences(locals.user.id, { viewState: merged });
	return json({ ok: true });
};
