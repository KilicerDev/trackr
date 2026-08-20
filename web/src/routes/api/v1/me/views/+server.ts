// Per-page view state for the mobile app — the same `view_state` blob the web
// pages use (saved views + last-used filters), so views saved on either
// surface show up on the other.
//   GET  — full view_state map, keyed by page (tasks/tickets/projects/…).
//   POST { key, patch } — shallow-merge `patch` into view_state[key]; a
//        `savedViews` array in the patch replaces the stored one wholesale
//        (web parity: create/rename/delete all resend the full array).
import { getPreferences } from '$lib/server/preferences';
import { applyViewPatch, validateViewPatch } from '$lib/server/view-state';
import { apiError, json, readJson, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const user = requireUser(locals);
	const prefs = await getPreferences(user.id);
	return json({ viewState: prefs.viewState ?? {} });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	const user = requireUser(locals);
	const body = await readJson<{ key?: string; patch?: unknown }>(request);
	const invalid = validateViewPatch(body.key, body.patch);
	if (invalid) apiError(invalid.status, invalid.message);
	await applyViewPatch(user.id, body.key as string, body.patch as object);
	return json({ ok: true });
};
