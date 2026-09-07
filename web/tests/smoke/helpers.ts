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
//   ROOT_EMAIL / ROOT_PASSWORD  (repo-root .env) enable the root cases in authz.test.ts

import '../../scripts/load-root-env';
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

// ─── Session cookies + form actions (authz suite) ───────────────────────────

/** Demo accounts the authz suite acts as (see scripts/db/seed/fixtures.ts). */
export const DEMO = {
	admin: { email: 'max.muster@trackr.dev', password: USER_PASSWORD },
	admin2: { email: 'maja.schmidt@trackr.dev', password: USER_PASSWORD },
	user: { email: 'leon.vogel@trackr.dev', password: USER_PASSWORD },
	/** ROOT_EMAIL / ROOT_PASSWORD from the repo-root .env (may be unset). */
	root: {
		email: process.env.ROOT_EMAIL ?? '',
		password: process.env.ROOT_PASSWORD ?? ''
	}
} as const;

/** Sign in and return the `cookie` header value for the browser-style session. */
export async function signInForCookie(email: string, password: string): Promise<string> {
	const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email, password }),
		signal: AbortSignal.timeout(30_000)
	});
	if (!res.ok) throw new Error(`sign-in as ${email} failed (HTTP ${res.status})`);
	return cookiesOf(res);
}

/** The `cookie` header a browser would send after this response. */
export function cookiesOf(res: Response): string {
	return joinCookies(res.headers.getSetCookie());
}

/** Same, from a list of raw Set-Cookie values. */
export function joinCookies(setCookie: string[]): string {
	return setCookie.map((c) => c.split(';')[0]).join('; ');
}

/** The user id behind a login (via /api/v1/me). */
export async function idOf(email: string, password: string): Promise<string> {
	const token = await signInForBearerToken(email, password);
	const res = await api<{ user: { id: string } }>('GET', '/api/v1/me', undefined, { token });
	if (res.status !== 200) throw new Error(`/api/v1/me as ${email} answered ${res.status}`);
	return res.body.user.id;
}

/** SvelteKit's JSON envelope for a form action called with x-sveltekit-action. */
export type ActionResult = {
	type: 'success' | 'failure' | 'redirect' | 'error';
	status?: number;
	location?: string;
	/** devalue-encoded payload — assert on `type`/`status`, or grep `raw`. */
	raw: string;
	setCookie: string[];
};

/**
 * Call a SvelteKit form action the way the app's pages do: urlencoded body,
 * `Origin` (the CSRF rule), `x-sveltekit-action`. Auth is a cookie header or
 * a bearer session token.
 */
export async function formAction(
	path: string,
	action: string,
	fields: Record<string, string>,
	auth: { cookie: string } | { token: string }
): Promise<ActionResult> {
	const headers: Record<string, string> = {
		origin: BASE_URL,
		'x-sveltekit-action': 'true',
		accept: 'application/json',
		'content-type': 'application/x-www-form-urlencoded'
	};
	if ('cookie' in auth) headers.cookie = auth.cookie;
	else headers.authorization = `Bearer ${auth.token}`;
	const res = await fetch(`${BASE_URL}${path}?/${action}`, {
		method: 'POST',
		headers,
		body: new URLSearchParams(fields),
		signal: AbortSignal.timeout(30_000)
	});
	const raw = await res.text();
	let parsed: { type?: ActionResult['type']; status?: number; location?: string; data?: string } =
		{};
	try {
		parsed = JSON.parse(raw);
	} catch {
		/* non-JSON (e.g. a 403 from the admin gate) — type 'error' below */
	}
	return {
		type: parsed.type ?? 'error',
		status: parsed.status ?? res.status,
		location: parsed.location,
		raw: parsed.data ?? raw,
		setCookie: res.headers.getSetCookie()
	};
}
