// Shared plumbing for the smoke suites (bun:test files in this directory).
//
// Smoke tests run against a LIVE trackr server and its database — by default
// the dev server on http://127.0.0.1:5173 with the demo dataset
// (`bun run db:seed --all`, which also creates the credentials below). They
// act as the demo user Max Muster and clean up every row they create; rows
// are titled with SMOKE_PREFIX so leftovers from an aborted run are easy to
// spot.
//
// Env:
//   TRACKR_TEST_URL   base URL of the server (default http://127.0.0.1:5173)
//   TRACKR_API_KEY    `trk_` key to present (default: the seeded test key)
//   DEMO_PASSWORD     demo user password (default demo12345)

import {
	TEST_API_KEY,
	TEST_USER_EMAIL,
	TEST_USER_PASSWORD
} from '../../scripts/db/seed/test-fixtures';

export const BASE_URL = (process.env.TRACKR_TEST_URL ?? 'http://127.0.0.1:5173').replace(
	/\/+$/,
	''
);
export const API_KEY = process.env.TRACKR_API_KEY ?? TEST_API_KEY;
export const USER_EMAIL = TEST_USER_EMAIL;
export const USER_PASSWORD = process.env.DEMO_PASSWORD ?? TEST_USER_PASSWORD;

/** Every row a smoke test creates starts with this, e.g. "[smoke] api task k3f9a". */
export const SMOKE_PREFIX = '[smoke]';

/** Short random token so a run's rows are unique and searchable. */
export function stamp(): string {
	return Math.random().toString(36).slice(2, 8);
}

/**
 * Fail fast with a readable message when nothing answers at BASE_URL — a
 * connection error from every test is far less helpful than one line.
 */
export async function requireServer(): Promise<void> {
	let res: Response;
	try {
		res = await fetch(`${BASE_URL}/api/v1/instance`, { signal: AbortSignal.timeout(5000) });
	} catch (err) {
		throw new Error(
			`No trackr server at ${BASE_URL} (${err instanceof Error ? err.message : err}). ` +
				'Start it with `bun run dev` or point TRACKR_TEST_URL at a running instance.',
			{ cause: err }
		);
	}
	const body = (await res.json().catch(() => null)) as { name?: string } | null;
	if (!res.ok || body?.name !== 'trackr') {
		throw new Error(`${BASE_URL}/api/v1/instance did not answer like trackr (HTTP ${res.status}).`);
	}
}

export type ApiResponse<T> = { status: number; body: T; headers: Headers };

/**
 * JSON call against /api/v1 with the smoke API key (or `token` when given —
 * e.g. a better-auth bearer session token; `null` sends no Authorization).
 * Never throws on HTTP errors: tests assert on `status` explicitly.
 */
export async function api<T = unknown>(
	method: string,
	path: string,
	body?: unknown,
	opts: { token?: string | null } = {}
): Promise<ApiResponse<T>> {
	const headers: Record<string, string> = { accept: 'application/json' };
	const token = opts.token === undefined ? API_KEY : opts.token;
	if (token) headers.authorization = `Bearer ${token}`;
	if (body !== undefined) headers['content-type'] = 'application/json';
	const res = await fetch(`${BASE_URL}${path}`, {
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body),
		signal: AbortSignal.timeout(30_000)
	});
	const text = await res.text();
	let parsed: unknown = text;
	try {
		parsed = text ? JSON.parse(text) : null;
	} catch {
		/* non-JSON body (e.g. a 404 HTML page) — keep the raw text */
	}
	return { status: res.status, body: parsed as T, headers: res.headers };
}

/**
 * Sign in with email + password through better-auth and return the bearer
 * session token (the `set-auth-token` header the bearer plugin exposes) —
 * the path the native app uses instead of an API key.
 */
export async function signInForBearerToken(
	email = USER_EMAIL,
	password = USER_PASSWORD
): Promise<string> {
	const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email, password }),
		signal: AbortSignal.timeout(30_000)
	});
	const token = res.headers.get('set-auth-token');
	if (!res.ok || !token) {
		throw new Error(
			`sign-in as ${email} failed (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`
		);
	}
	return token;
}
