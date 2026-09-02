// Shared plumbing for the /api/v1 JSON surface consumed by the native app.
//
// These routes live OUTSIDE the (app) group on purpose: JSON clients must get
// JSON errors, never the login redirect that group's layout performs. Auth
// arrives as `Authorization: Bearer <token>` (better-auth bearer plugin) and is
// resolved by the same hooks.server.ts handler that resolves cookies, so
// `locals.user`/`locals.memberships` are populated identically.
//
// CORS is intentionally absent: the app calls these through tauri-plugin-http
// (Rust side — no Origin header, no cookies), so browser CORS never applies.
// A future browser-based client would need a CORS handler added here.

import { error, json } from '@sveltejs/kit';

type Locals = App.Locals;

/** 401 as JSON unless a session (cookie or bearer) resolved. */
export function requireUser(locals: Locals): NonNullable<Locals['user']> {
	if (!locals.user) {
		error(401, 'Not authenticated.');
	}
	return locals.user;
}

/** Consistent `{ error }` body for expected failures. */
export function apiError(status: number, message: string): never {
	error(status, message);
}

/** Parse a JSON body, 400 on malformed input. */
export async function readJson<T>(request: Request): Promise<T> {
	try {
		return (await request.json()) as T;
	} catch {
		error(400, 'Invalid JSON body.');
	}
}

/**
 * Parse a create/reply body that may carry staged files. JSON clients send
 * the plain object as before; clients that attach files send
 * `multipart/form-data` with the same object JSON-encoded in a `payload`
 * field plus one or more `attachments` file parts (the web modals' shape).
 * Files are returned separately so the handler can attach them once the
 * parent row exists — and BEFORE it emits webhooks, so the payload can list
 * them.
 */
export async function readBody<T>(request: Request): Promise<{ body: T; files: File[] }> {
	const contentType = request.headers.get('content-type') ?? '';
	if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
		return { body: await readJson<T>(request), files: [] };
	}
	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		error(400, 'Invalid form data.');
	}
	const raw = form.get('payload');
	let body: T;
	try {
		body = (typeof raw === 'string' && raw.trim() ? JSON.parse(raw) : {}) as T;
	} catch {
		error(400, 'Invalid JSON payload.');
	}
	const files = form
		.getAll('attachments')
		.filter((f): f is File => f instanceof File && f.size > 0);
	return { body, files };
}

export { json };
