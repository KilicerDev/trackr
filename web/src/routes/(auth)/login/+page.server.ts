import { error, fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { auth, NATIVE_AUTH_CALLBACK, cliAuthCallback } from '$lib/server/auth';
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

export const load: PageServerLoad = ({ locals, url }) => {
	// `?client=native` marks a sign-in started from the Tauri app (opened in
	// the system browser); `?client=cli` one started by `trackr login`. A
	// lingering web session must not skip the form for either — the client
	// needs a fresh token delivered through its callback redirect below.
	const client = url.searchParams.get('client');
	const native = client === 'native';
	const cli = client === 'cli';
	if (locals.user && !native && !cli) {
		const next = url.searchParams.get('next');
		redirect(302, next && next.startsWith('/') ? next : '/');
	}
	if (cli) {
		return {
			native: false,
			cli: true,
			cliPort: parseCliPort(url.searchParams.get('port')),
			cliState: parseCliState(url.searchParams.get('state'))
		};
	}
	return { native, cli: false };
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

		let token: string | null = null;
		try {
			const { headers, response } = await auth.api.signInEmail({
				body: { email, password },
				headers: event.request.headers,
				returnHeaders: true
			});
			// The bearer plugin mirrors the signed session cookie into
			// `set-auth-token` — that signed value is what the app must present as
			// its Bearer credential. `response.token` (unsigned) is the fallback;
			// the plugin accepts both, but prefer the header.
			token = headers.get('set-auth-token') ?? response.token ?? null;
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, { message: error.message || m.auth_login_failed(), email });
			}
			return fail(500, { message: m.auth_generic_error(), email });
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
