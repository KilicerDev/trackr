import { json } from '@sveltejs/kit';
import { applyViewPatch, validateViewPatch } from '$lib/server/view-state';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ message: 'Not authenticated' }, { status: 401 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ message: 'Invalid JSON' }, { status: 400 });
	}
	const { key, patch } = (body ?? {}) as { key?: string; patch?: unknown };

	const invalid = validateViewPatch(key, patch);
	if (invalid) return json({ message: invalid.message }, { status: invalid.status });

	await applyViewPatch(locals.user.id, key as string, patch as object);
	return json({ ok: true });
};
