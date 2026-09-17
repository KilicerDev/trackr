import { error, json, redirect, text, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { env } from '$env/dynamic/private';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { looksLikeApiKey, resolveApiKey } from '$lib/server/api-keys';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { can, deriveIsAdmin, loadMemberships } from '$lib/server/permissions';
import { adminRoutePermission, SUPERADMIN_REQUIRED_MESSAGE } from '$lib/server/admin-routes';
import { getPreferences, PREF_DEFAULTS } from '$lib/server/preferences';
import { recordAudit } from '$lib/server/audit';
import { getBranding } from '$lib/server/branding';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { cookieName, isLocale } from '$lib/paraglide/runtime';

// Content types a plain HTML <form> can submit cross-site — the ones a browser
// sends along with our session cookie without a CORS preflight. Mirrors
// SvelteKit's own is_form_content_type list.
const FORM_CONTENT_TYPES = new Set([
	'application/x-www-form-urlencoded',
	'multipart/form-data',
	'text/plain',
	'application/x-sveltekit-formdata'
]);
const CSRF_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// OAuth 2.1 token endpoint of the MCP plugin: clients (claude.ai, Claude Code)
// POST `application/x-www-form-urlencoded` server-to-server with no Origin at
// all. The request is authenticated by the authorization code + PKCE verifier,
// never by our session cookie, so the origin rule does not apply to it.
const CSRF_EXEMPT_PATHS = new Set(['/api/auth/mcp/token']);

// Replacement for SvelteKit's `csrf.checkOrigin` (disabled in svelte.config.js).
// Same rule — form-content mutations must carry an Origin header matching the
// request origin (or ORIGIN) — with one exemption: requests that carry an
// `Authorization` header. A cross-site form submission can't set custom
// headers, and a cross-site fetch that does triggers a CORS preflight we never
// answer, so such a request is by construction not a CSRF. This is how the
// native iOS app uploads attachments: URLSession sends no Origin header at
// all, which the stock check treats as cross-site.
const handleCsrf: Handle = async ({ event, resolve }) => {
	const { request, url } = event;
	if (
		CSRF_METHODS.has(request.method) &&
		!request.headers.has('authorization') &&
		!CSRF_EXEMPT_PATHS.has(url.pathname)
	) {
		const type = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() ?? '';
		if (FORM_CONTENT_TYPES.has(type)) {
			const origin = request.headers.get('origin');
			const trusted = env.ORIGIN ? [env.ORIGIN] : [];
			if (origin !== url.origin && (!origin || !trusted.includes(origin))) {
				const message = `Cross-site ${request.method} form submissions are forbidden`;
				if (request.headers.get('accept') === 'application/json') {
					return json({ message }, { status: 403 });
				}
				return text(message, { status: 403 });
			}
		}
	}
	return resolve(event);
};

// `Authorization: Bearer trk_…` is a personal API key ($lib/server/api-keys),
// not a better-auth session token. It is honoured ONLY where listed in
// `apiKeyAllowed`: a key must never drive the HTML app, its form actions, or
// /api/auth/* (password change, session listing…). Anywhere else the request
// simply stays anonymous. Returns true when the key populated `locals`.
function apiKeyAllowed(method: string, pathname: string): boolean {
	// The JSON surface built for machine clients.
	if (pathname.startsWith('/api/v1/')) return true;
	// The MCP endpoint: a key is one of its two bearer kinds (the other is an
	// OAuth token resolved in $lib/server/mcp/auth). Per-user enablement is
	// checked there, not here.
	if (pathname === '/api/mcp') return true;
	// Read-only attachment fetches (inline + /download), so integrations can
	// resolve the file URLs that API responses and webhook payloads carry. The
	// handlers run the full per-file permission check themselves.
	if (method === 'GET' && pathname.startsWith('/api/attachments/')) return true;
	return false;
}

async function resolveApiKeyAuth(event: Parameters<Handle>[0]['event']): Promise<boolean> {
	const header = event.request.headers.get('authorization');
	if (!header?.startsWith('Bearer ')) return false;
	const token = header.slice('Bearer '.length).trim();
	if (!looksLikeApiKey(token)) return false;
	if (!apiKeyAllowed(event.request.method, event.url.pathname)) return false;

	const resolved = await resolveApiKey(token);
	if (!resolved) return false;
	// The DB row carries the same columns better-auth puts on `session.user`
	// (admin plugin fields included), so downstream code sees an identical shape.
	event.locals.user = resolved.user as unknown as NonNullable<App.Locals['user']>;
	event.locals.authKind = 'api_key';
	event.locals.apiKeyId = resolved.keyId;
	await loadActorContext(event, resolved.user.id);
	return true;
}

// Everything a request needs about the signed-in user beyond the session
// itself, fetched in one parallel batch: memberships (roles) and preferences
// (locale, theme, saved view state). Stashed on `locals` so neither the
// locale hook nor any load function has to query them again.
async function loadActorContext(event: Parameters<Handle>[0]['event'], userId: string) {
	const [memberships, preferences] = await Promise.all([
		loadMemberships(userId),
		getPreferences(userId)
	]);
	event.locals.memberships = memberships;
	event.locals.isAdmin = await deriveIsAdmin(memberships);
	event.locals.preferences = preferences;
}

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	if (await resolveApiKeyAuth(event)) {
		return svelteKitHandler({ event, resolve, auth, building });
	}

	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
		event.locals.authKind = 'session';
		await loadActorContext(event, session.user.id);
	}

	// better-auth's admin plugin (`/api/auth/admin/*`: set-role, impersonate,
	// set-user-password, remove-user, …) is never used over HTTP — every admin
	// operation in the app runs server-side through `auth.api.*` from a form
	// action that enforces the role hierarchy. Over HTTP the plugin would only
	// check `hasPermission(role)`, so any admin could act on a superadmin.
	// This has to live here: svelteKitHandler answers /api/auth/* itself and
	// never calls resolve(), so later handles (handleAdminGuard) don't run.
	if (event.url.pathname.startsWith('/api/auth/admin/')) {
		void recordAudit(
			{
				type: 'authz.denied',
				actorId: session?.user.id ?? null,
				actorLabel: session?.user.email ?? null,
				meta: { path: event.url.pathname, transport: 'http', reason: 'admin_api_http' }
			},
			event
		);
		return json(
			{ message: 'The admin API is not available over HTTP.', code: 'ADMIN_API_HTTP_DISABLED' },
			{ status: 403 }
		);
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

// Method-agnostic /admin gate (page routes + their form actions; the
// better-auth admin API under /api/auth/admin is refused in handleBetterAuth).
// Layout loads don't run for form-action POSTs,
// so guarding only in /admin/+layout.server.ts leaves every admin action open
// to any authenticated user. This hook closes that hole class for GET and POST
// alike; the per-action checks in the page files remain as defense in depth.
const handleAdminGuard: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	if (path === '/admin' || path.startsWith('/admin/')) {
		if (!event.locals.user) redirect(302, `/login?next=${encodeURIComponent(path)}`);
		if (!event.locals.isAdmin) error(403, 'Admin access required.');
		// Superadmin-tier subtrees (settings, job queue, schedules) need an
		// explicit permission that admin.access never overrides — the table in
		// $lib/server/admin-routes is the one place that lists them.
		const extra = adminRoutePermission(path);
		if (extra && !(await can(event.locals, extra))) error(403, SUPERADMIN_REQUIRED_MESSAGE);
	}
	return resolve(event);
};

// For logged-in users the DB (`user_preferences.locale`) is the durable, authoritative
// store. We reconcile the Paraglide cookie to it *before* Paraglide reads the request,
// so the first painted HTML is already in the saved language (no flash). The
// preferences were loaded alongside the session (loadActorContext).
const handleLocale: Handle = async ({ event, resolve }) => {
	if (event.locals.user) {
		const preferences = event.locals.preferences ?? (await getPreferences(event.locals.user.id));
		event.locals.preferences = preferences;

		const desired = isLocale(preferences.locale) ? preferences.locale : 'en';
		const current = event.cookies.get(cookieName);
		if (current !== desired) {
			// Rewrite the incoming request's cookie so paraglideMiddleware (next hook)
			// resolves the DB locale on *this* request, and persist it for the next one.
			// httpOnly:false so Paraglide's client runtime can read it after
			// hydration (matches the settings action; an httpOnly cookie would make
			// the client fall back to the browser language).
			event.cookies.set(cookieName, desired, {
				path: '/',
				maxAge: 60 * 60 * 24 * 400,
				httpOnly: false,
				sameSite: 'lax'
			});
			const headers = new Headers(event.request.headers);
			const others = (headers.get('cookie') ?? '')
				.split(';')
				.map((c) => c.trim())
				.filter((c) => c && !c.startsWith(`${cookieName}=`));
			headers.set('cookie', [...others, `${cookieName}=${desired}`].join('; '));
			// Rebuild from the parts rather than `new Request(request, { headers })`:
			// under Bun, cloning a request whose body is the Node stream that
			// adapter-node wraps never delivers the body, so every POST from a
			// client without the locale cookie (API keys, the mobile app, the
			// smoke tests) hung until the client gave up. The body is buffered
			// because downstream code clones the request again (the MCP
			// transport does), which fails on a re-wrapped stream; only clients
			// without the cookie take this path, and SvelteKit reads form and
			// JSON bodies into memory anyway.
			const { request } = event;
			let body: ArrayBuffer | null = null;
			if (request.method !== 'GET' && request.method !== 'HEAD') {
				try {
					body = await request.arrayBuffer();
				} catch (e) {
					// adapter-node rejects bodies over BODY_SIZE_LIMIT with a 413
					// while they are read; answer the same way instead of a 500.
					const status = (e as { status?: number }).status;
					error(status && status >= 400 && status < 600 ? status : 400, (e as Error).message);
				}
			}
			event.request = new Request(request.url, {
				method: request.method,
				headers,
				body,
				signal: request.signal
			});
		}
	}

	return resolve(event);
};

function escapeAttr(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, async ({ request, locale }) => {
		event.request = request;
		// Instance branding for the static head of app.html (<title> before any
		// page sets its own, and the favicon). Pages get the same values from
		// the root layout load.
		const brand = await getBranding();
		const brandName = escapeAttr(brand.name);
		const brandIcon = escapeAttr(brand.logoUrl ?? '/favicon.svg');
		// Inject the saved theme/density into the SSR'd <html> so the first paint
		// already matches the user's preference — same no-flash approach as the
		// locale above. The client effect in (app)/+layout re-applies the same
		// values on hydration (a no-op), and still drives live changes. Logged-out
		// requests fall back to PREF_DEFAULTS (matching the old hardcoded markup).
		const p = event.locals.preferences;
		const rawTheme = p?.theme ?? PREF_DEFAULTS.theme;
		const theme = rawTheme === 'system' ? 'dark' : rawTheme;
		const density = p?.density ?? PREF_DEFAULTS.density;
		return resolve(event, {
			transformPageChunk: ({ html }) =>
				html
					.replace('%lang%', locale)
					.replace('%theme%', theme)
					.replace('%density%', density)
					.replace('%brand.name%', brandName)
					.replace('%brand.icon%', brandIcon)
		});
	});

export const handle: Handle = sequence(
	handleCsrf,
	handleBetterAuth,
	handleAdminGuard,
	handleLocale,
	handleParaglide
);
