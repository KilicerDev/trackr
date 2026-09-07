import { error, json, redirect, text, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { env } from '$env/dynamic/private';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { looksLikeApiKey, resolveApiKey } from '$lib/server/api-keys';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { deriveIsAdmin, loadMemberships } from '$lib/server/permissions';
import { isSuperadmin } from '$lib/roles';
import { getPreferences, PREF_DEFAULTS } from '$lib/server/preferences';
import { recordAudit } from '$lib/server/audit';
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
	const memberships = await loadMemberships(resolved.user.id);
	event.locals.memberships = memberships;
	event.locals.isAdmin = await deriveIsAdmin(memberships);
	return true;
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
		const memberships = await loadMemberships(session.user.id);
		event.locals.memberships = memberships;
		event.locals.isAdmin = await deriveIsAdmin(memberships);
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
		if (
			(path === '/admin/system' || path.startsWith('/admin/system/')) &&
			!isSuperadmin(event.locals.user.role)
		) {
			error(403, 'Superadmin access required.');
		}
	}
	return resolve(event);
};

// For logged-in users the DB (`user_preferences.locale`) is the durable, authoritative
// store. We reconcile the Paraglide cookie to it *before* Paraglide reads the request,
// so the first painted HTML is already in the saved language (no flash). The resolved
// preferences are stashed on `locals` so the layout loader doesn't re-query.
const handleLocale: Handle = async ({ event, resolve }) => {
	if (event.locals.user) {
		const preferences = await getPreferences(event.locals.user.id);
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
			event.request = new Request(event.request, { headers });
		}
	}

	return resolve(event);
};

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;
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
				html.replace('%lang%', locale).replace('%theme%', theme).replace('%density%', density)
		});
	});

export const handle: Handle = sequence(
	handleCsrf,
	handleBetterAuth,
	handleAdminGuard,
	handleLocale,
	handleParaglide
);
