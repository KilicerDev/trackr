import { error, fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { APIError } from 'better-auth/api';
import { auth, NATIVE_AUTH_CALLBACK, cliAuthCallback } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { oauthApplication } from '$lib/server/db/auth.schema';
import { isMcpEnabled } from '$lib/server/mcp/access';
import { m } from '$lib/paraglide/messages';
import type { Actions, PageServerLoad } from './$types';

// CLI sign-in callback parameters. The port targets the loopback listener
// `trackr login` runs; state is an opaque nonce the CLI generated and checks
// on the callback (CSRF guard) — the server merely echoes it. Both are
// validated wherever they enter, never trusted from the round-trip.
function parseCliPort(value: unknown): number {
	const port = Number.parseInt(String(value ?? ''), 10);
	if (!Number.isInteger(port) || port < 1024 || port > 65535) {
		error(400, 'invalid CLI callback port');
	}
	return port;
}

function parseCliState(value: unknown): string {
	const state = String(value ?? '');
	if (!/^[A-Za-z0-9_-]{16,128}$/.test(state)) {
		error(400, 'invalid CLI sign-in state');
	}
	return state;
}

// ─── MCP OAuth mode ────────────────────────────────────────────────────────
// better-auth's mcp plugin sends unauthenticated authorize requests here with
// the original authorize query (client_id, redirect_uri, response_type, state,
// code_challenge…) and a signed `oidc_login_prompt` cookie. Consent is skipped
// by the plugin, so this page IS the consent screen: it names the client, and
// resumes the flow by redirecting to the authorize endpoint after sign-in.

const OIDC_PROMPT_COOKIE = 'oidc_login_prompt';

type OAuthMode = {
	clientName: string;
	authorizeUrl: string;
	cancelUrl: string | null;
	enabled: boolean;
	userName: string | null;
	userEmail: string | null;
};

// Present when all three mandatory authorize params round-tripped. Returns
// the query string to resume with, or null when this is a normal sign-in.
function oauthQuery(params: URLSearchParams): string | null {
	if (!params.get('client_id') || !params.get('redirect_uri') || !params.get('response_type')) {
		return null;
	}
	return params.toString();
}

// Where "Cancel" sends the browser: the client's redirect_uri with the
// standard access_denied error — but only if the URI is registered for that
// client and is https or loopback http, so the page never becomes an open
// redirect to an arbitrary scheme/host from the query string.
function cancelUrlFor(
	redirectUri: string,
	registered: string[],
	state: string | null
): string | null {
	if (!registered.includes(redirectUri)) return null;
	let target: URL;
	try {
		target = new URL(redirectUri);
	} catch {
		return null;
	}
	const loopback =
		target.protocol === 'http:' &&
		(target.hostname === 'localhost' ||
			target.hostname === '127.0.0.1' ||
			target.hostname === '[::1]');
	if (target.protocol !== 'https:' && !loopback) return null;
	target.searchParams.set('error', 'access_denied');
	if (state) target.searchParams.set('state', state);
	return target.toString();
}

async function oauthMode(params: URLSearchParams, user: App.Locals['user']): Promise<OAuthMode> {
	const clientId = params.get('client_id') ?? '';
	const [client] = await db
		.select({ name: oauthApplication.name, redirectUrls: oauthApplication.redirectUrls })
		.from(oauthApplication)
		.where(eq(oauthApplication.clientId, clientId))
		.limit(1);
	const registered = (client?.redirectUrls ?? '').split(',').filter(Boolean);
	return {
		clientName: client?.name?.trim() || m.mcp_login_default_client(),
		authorizeUrl: `/api/auth/mcp/authorize?${params.toString()}`,
		cancelUrl: cancelUrlFor(params.get('redirect_uri') ?? '', registered, params.get('state')),
		enabled: user ? await isMcpEnabled(user.id) : false,
		userName: user?.name ?? null,
		userEmail: user?.email ?? null
	};
}

// The plugin's after-hook resumes the authorize flow inside ANY request that
// sets a session cookie while `oidc_login_prompt` is present — including the
// `auth.api.signInEmail` call below, where its redirect would surface as an
// unusable exception. We resume explicitly instead, so hide the cookie from
// better-auth for the sign-in call (every mode: a stale prompt cookie from an
// abandoned OAuth attempt must not hijack a normal sign-in either).
function headersWithoutPromptCookie(headers: Headers): Headers {
	const copy = new Headers(headers);
	const cookie = copy.get('cookie');
	if (!cookie) return copy;
	const kept = cookie
		.split(';')
		.map((c) => c.trim())
		.filter((c) => c && !c.startsWith(`${OIDC_PROMPT_COOKIE}=`));
	if (kept.length) copy.set('cookie', kept.join('; '));
	else copy.delete('cookie');
	return copy;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	// `?client=native` marks a sign-in started from the Tauri app (opened in
	// the system browser); `?client=cli` one started by `trackr login`. A
	// lingering web session must not skip the form for either — the client
	// needs a fresh token delivered through its callback redirect below.
	const client = url.searchParams.get('client');
	const native = client === 'native';
	const cli = client === 'cli';
	const oauth = oauthQuery(url.searchParams);
	if (oauth) {
		// Never auto-redirect a signed-in user: they confirm ("Continue as …")
		// or cancel on this page first.
		return { native: false, cli: false, oauth: await oauthMode(url.searchParams, locals.user) };
	}
	if (locals.user && !native && !cli) {
		const next = url.searchParams.get('next');
		redirect(302, next && next.startsWith('/') ? next : '/');
	}
	if (cli) {
		return {
			native: false,
			cli: true,
			oauth: null,
			cliPort: parseCliPort(url.searchParams.get('port')),
			cliState: parseCliState(url.searchParams.get('state'))
		};
	}
	return { native, cli: false, oauth: null };
};

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const email = formData.get('email')?.toString().trim().toLowerCase() ?? '';
		const password = formData.get('password')?.toString() ?? '';
		const next = formData.get('next')?.toString() ?? '';
		const client = formData.get('client')?.toString() ?? '';
		const native = client === 'native';
		const cli = client === 'cli';
		// Re-validate the OAuth resume query — it round-tripped through a hidden
		// field and is as untrusted as the URL it came from. Anything short of
		// the three mandatory params degrades to a normal sign-in.
		const oauth =
			formData.get('oauth')?.toString() === '1'
				? oauthQuery(new URLSearchParams(formData.get('authorize')?.toString() ?? ''))
				: null;

		let token: string | null;
		let userId: string | null;
		try {
			const { headers, response } = await auth.api.signInEmail({
				body: { email, password },
				headers: headersWithoutPromptCookie(event.request.headers),
				returnHeaders: true
			});
			// The bearer plugin mirrors the signed session cookie into
			// `set-auth-token` — that signed value is what the app must present as
			// its Bearer credential. `response.token` (unsigned) is the fallback;
			// the plugin accepts both, but prefer the header.
			token = headers.get('set-auth-token') ?? response.token ?? null;
			userId = response.user?.id ?? null;
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, { message: error.message || m.auth_login_failed(), email });
			}
			return fail(500, { message: m.auth_generic_error(), email });
		}

		if (oauth) {
			// The plugin's prompt cookie has done its job (or never existed).
			event.cookies.delete(OIDC_PROMPT_COOKIE, { path: '/' });
			// Signed in either way; without MCP access the flow stops here and
			// the page (re-loaded with the new session) explains why.
			if (!userId || !(await isMcpEnabled(userId))) {
				return fail(403, { message: m.mcp_login_not_enabled(), email });
			}
			redirect(303, `/api/auth/mcp/authorize?${oauth}`);
		}

		if (native) {
			if (!token) return fail(500, { message: m.auth_generic_error(), email });
			// Hand the session token to the app via its deep-link scheme. The
			// browser tab shows the OS "open in app?" prompt and can be closed.
			redirect(303, `${NATIVE_AUTH_CALLBACK}?token=${encodeURIComponent(token)}`);
		}

		if (cli) {
			if (!token) return fail(500, { message: m.auth_generic_error(), email });
			// Re-validate — the hidden form fields round-tripped through the
			// browser and are as untrusted as the query params they came from.
			const port = parseCliPort(formData.get('port'));
			const state = parseCliState(formData.get('state'));
			redirect(
				303,
				`${cliAuthCallback(port)}?token=${encodeURIComponent(token)}&state=${encodeURIComponent(state)}`
			);
		}

		redirect(302, next && next.startsWith('/') ? next : '/');
	}
};
