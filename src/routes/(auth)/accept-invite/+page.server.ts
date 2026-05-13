import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { auth } from '$lib/server/auth';
import { acceptInvitation, findInvitationByToken } from '$lib/server/invitations';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const token = event.url.searchParams.get('token') ?? '';
	if (!token) {
		return { token: '', invitation: null as null | { email: string; name: string } };
	}
	const inv = await findInvitationByToken(token);
	if (!inv) return { token, invitation: null };
	return { token, invitation: { email: inv.email, name: inv.name } };
};

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const token = form.get('token')?.toString() ?? '';
		const password = form.get('password')?.toString() ?? '';

		if (!token) return fail(400, { message: 'Missing or invalid invitation token.' });
		if (password.length < 8) {
			return fail(400, { message: 'Password must be at least 8 characters.' });
		}

		const result = await acceptInvitation({ token, password });
		if (!result.ok) {
			if (result.reason === 'invalid_token') {
				return fail(400, { message: 'This invitation link is invalid or has expired.' });
			}
			return fail(400, { message: 'An account already exists for that email.' });
		}

		try {
			await auth.api.signInEmail({
				body: { email: result.email, password },
				headers: event.request.headers
			});
		} catch (err) {
			if (err instanceof APIError) {
				return fail(500, {
					message: err.message || 'Your account was created, but signing in failed.'
				});
			}
			return fail(500, { message: 'Your account was created, but signing in failed.' });
		}

		redirect(303, '/');
	}
};
