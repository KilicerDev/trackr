import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { auth, NATIVE_AUTH_CALLBACK } from '$lib/server/auth';
import { m } from '$lib/paraglide/messages';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	// `?client=native` marks a sign-in started from the Tauri app (opened in the
	// system browser). A lingering web session must not skip the form for native
	// clients — the app needs a fresh token delivered through the callback
	// redirect below.
	const native = url.searchParams.get('client') === 'native';
	if (locals.user && !native) {
		const next = url.searchParams.get('next');
		redirect(302, next && next.startsWith('/') ? next : '/');
	}
	return { native };
};

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const email = formData.get('email')?.toString().trim().toLowerCase() ?? '';
		const password = formData.get('password')?.toString() ?? '';
		const next = formData.get('next')?.toString() ?? '';
		const native = formData.get('client')?.toString() === 'native';

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

		redirect(302, next && next.startsWith('/') ? next : '/');
	}
};
