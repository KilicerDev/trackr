import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { feedback } from '$lib/server/db/app.schema';
import type { RequestHandler } from './$types';

const KINDS = new Set(['bug', 'idea', 'general']);
const MAX_MESSAGE = 4000;
const MAX_URL = 1000;
const MAX_UA = 500;

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ message: 'Not authenticated' }, { status: 401 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ message: 'Invalid JSON' }, { status: 400 });
	}
	const { kind, message, url } = (body ?? {}) as {
		kind?: string;
		message?: string;
		url?: string;
	};

	const k = kind && KINDS.has(kind) ? kind : 'general';
	const msg = typeof message === 'string' ? message.trim() : '';
	if (!msg) return json({ message: 'Message is required' }, { status: 400 });
	if (msg.length > MAX_MESSAGE) {
		return json({ message: 'Message is too long' }, { status: 413 });
	}

	const ua = request.headers.get('user-agent')?.slice(0, MAX_UA) ?? null;
	const pageUrl = typeof url === 'string' && url ? url.slice(0, MAX_URL) : null;

	await db.insert(feedback).values({
		id: crypto.randomUUID(),
		userId: locals.user.id,
		kind: k,
		message: msg,
		url: pageUrl,
		userAgent: ua
	});

	return json({ ok: true });
};
