import { json } from '@sveltejs/kit';
import { upsertPreferences, getPreferences } from '$lib/server/preferences';
import type { RequestHandler } from './$types';

const ALLOWED_KEYS = new Set([
	'tasks',
	'projects',
	'week',
	'tickets',
	'wiki',
	'notes',
	'portal',
	'shell'
]);
const MAX_BYTES = 32 * 1024;
const MAX_SAVED_VIEWS = 20;
const MAX_VIEW_NAME = 60;

// Saved views are client-authored blobs; validate the envelope (count, id,
// name) so a buggy or malicious client can't bloat the row — the config
// payload itself stays opaque here.
function validSavedViews(value: unknown): boolean {
	if (!Array.isArray(value) || value.length > MAX_SAVED_VIEWS) return false;
	return value.every((entry) => {
		if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) return false;
		const { id, name } = entry as { id?: unknown; name?: unknown };
		if (typeof id !== 'string' || id.length === 0) return false;
		return typeof name === 'string' && name.trim().length > 0 && name.length <= MAX_VIEW_NAME;
	});
}

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
	if ('savedViews' in patch && !validSavedViews((patch as Record<string, unknown>).savedViews)) {
		return json({ message: 'Invalid saved views' }, { status: 400 });
	}

	const existing = await getPreferences(locals.user.id);
	const prevForKey = (existing.viewState[key] ?? {}) as Record<string, unknown>;
	const merged = { ...existing.viewState, [key]: { ...prevForKey, ...(patch as object) } };

	await upsertPreferences(locals.user.id, { viewState: merged });
	return json({ ok: true });
};
