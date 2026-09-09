// The signed-in user's list of other trackr instances (TRACK-140), the data
// behind the sidebar brand-mark switcher. Per user, per instance: nothing here
// talks to the other deployment — the browser probed it already and sends
// what the probe returned. The server re-validates the URL, caps the name and
// only keeps a logo URL on the instance's own origin (it ends up in an <img>).
//
// JSON bodies only: a cross-site form post can't produce them, and a
// cross-site fetch with a JSON content type needs a CORS preflight nobody
// answers, so the session cookie alone can't be abused to edit the list.
import { json } from '@sveltejs/kit';
import { getPreferences, upsertPreferences } from '$lib/server/preferences';
import type { LinkedInstance } from '$lib/server/db/app.schema';
import {
	INSTANCES_MAX,
	normalizeInstanceUrl,
	sameInstance,
	sanitizeInstanceName,
	sanitizeLogoUrl
} from '$lib/instances';
import type { RequestHandler } from './$types';

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
	try {
		const body = await request.json();
		return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

/** Add (or refresh) one instance. Body: { url, name?, logoUrl? }. */
export const POST: RequestHandler = async ({ request, locals, url: requestUrl }) => {
	if (!locals.user) return json({ message: 'Not authenticated' }, { status: 401 });
	const body = await readJson(request);
	if (!body) return json({ message: 'Invalid JSON' }, { status: 400 });

	const target = normalizeInstanceUrl(typeof body.url === 'string' ? body.url : null);
	if (!target) return json({ message: 'Invalid instance URL' }, { status: 400 });
	if (sameInstance(target, requestUrl.origin)) {
		return json({ message: 'That is this instance' }, { status: 400 });
	}

	const prefs = await getPreferences(locals.user.id);
	const existing = prefs.instances.find((i) => sameInstance(i.url, target));
	const entry: LinkedInstance = {
		url: target,
		name: sanitizeInstanceName(body.name, target),
		logoUrl: sanitizeLogoUrl(body.logoUrl, target),
		addedAt: existing?.addedAt ?? new Date().toISOString()
	};
	const others = prefs.instances.filter((i) => !sameInstance(i.url, target));
	if (!existing && others.length >= INSTANCES_MAX) {
		return json({ message: 'Too many instances' }, { status: 400 });
	}
	const instances = existing
		? prefs.instances.map((i) => (sameInstance(i.url, target) ? entry : i))
		: [...others, entry];
	await upsertPreferences(locals.user.id, { instances });
	return json({ ok: true, instances });
};

/** Remove one instance. Body: { url }. */
export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ message: 'Not authenticated' }, { status: 401 });
	const body = await readJson(request);
	if (!body) return json({ message: 'Invalid JSON' }, { status: 400 });
	const target = normalizeInstanceUrl(typeof body.url === 'string' ? body.url : null);
	if (!target) return json({ message: 'Invalid instance URL' }, { status: 400 });

	const prefs = await getPreferences(locals.user.id);
	const instances = prefs.instances.filter((i) => !sameInstance(i.url, target));
	if (instances.length !== prefs.instances.length) {
		await upsertPreferences(locals.user.id, { instances });
	}
	return json({ ok: true, instances });
};
