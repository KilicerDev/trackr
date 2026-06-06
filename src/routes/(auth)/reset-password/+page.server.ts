import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { auth } from '$lib/server/auth';
import { m } from '$lib/paraglide/messages';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const token = url.searchParams.get('token') ?? '';
	const linkError = url.searchParams.get('error');
	return { token, linkError };
};

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const token = form.get('token')?.toString() ?? '';
		const password = form.get('password')?.toString() ?? '';

		if (!token) return fail(400, { message: m.auth_reset_missing_token() });
		if (password.length < 8) {
			return fail(400, { message: m.auth_password_min_chars({ min: 8 }) });
		}

		try {
			await auth.api.resetPassword({
				body: { newPassword: password, token },
				headers: event.request.headers
			});
		} catch (err) {
			if (err instanceof APIError) {
				return fail(400, { message: err.message || m.auth_reset_failed() });
			}
			return fail(500, { message: m.auth_generic_error() });
		}

		redirect(303, '/login?reset=1');
	}
};
