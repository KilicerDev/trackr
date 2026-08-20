// Per-page view bookkeeping (`user_preferences.view_state`): validation and
// merge shared by the web endpoint (/api/preferences/view) and the mobile one
// (/api/v1/me/views). Saved views are client-authored blobs; we validate the
// envelope (count, id, name) so a buggy or malicious client can't bloat the
// row — the config payload itself stays opaque here.
import { getPreferences, upsertPreferences } from './preferences';

export const VIEW_STATE_KEYS = new Set([
	'tasks',
	'projects',
	'week',
	'tickets',
	'wiki',
	'notes',
	'portal',
	'shell'
]);
export const VIEW_STATE_MAX_BYTES = 32 * 1024;
export const MAX_SAVED_VIEWS = 20;
export const MAX_VIEW_NAME = 60;

export function validSavedViews(value: unknown): boolean {
	if (!Array.isArray(value) || value.length > MAX_SAVED_VIEWS) return false;
	return value.every((entry) => {
		if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) return false;
		const { id, name } = entry as { id?: unknown; name?: unknown };
		if (typeof id !== 'string' || id.length === 0) return false;
		return typeof name === 'string' && name.trim().length > 0 && name.length <= MAX_VIEW_NAME;
	});
}

export type ViewPatchError = { status: number; message: string };

/** Validate a {key, patch} pair; returns the error to send, or null when ok. */
export function validateViewPatch(key: unknown, patch: unknown): ViewPatchError | null {
	if (typeof key !== 'string' || !VIEW_STATE_KEYS.has(key)) {
		return { status: 400, message: 'Invalid key' };
	}
	if (patch == null || typeof patch !== 'object' || Array.isArray(patch)) {
		return { status: 400, message: 'Patch must be an object' };
	}
	if (JSON.stringify(patch).length > VIEW_STATE_MAX_BYTES) {
		return { status: 413, message: 'Patch too large' };
	}
	if ('savedViews' in patch && !validSavedViews((patch as Record<string, unknown>).savedViews)) {
		return { status: 400, message: 'Invalid saved views' };
	}
	return null;
}

/** Shallow-merge a validated patch into the user's view_state for `key`. */
export async function applyViewPatch(userId: string, key: string, patch: object): Promise<void> {
	const existing = await getPreferences(userId);
	const prevForKey = (existing.viewState[key] ?? {}) as Record<string, unknown>;
	const merged = { ...existing.viewState, [key]: { ...prevForKey, ...patch } };
	await upsertPreferences(userId, { viewState: merged });
}
