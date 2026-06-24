import { fail } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { m } from '$lib/paraglide/messages';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const email = form.get('email')?.toString().trim().toLowerCase() ?? '';

		if (!email) {
			return fail(400, { message: m.auth_email_required(), email });
		}

		try {
			await auth.api.requestPasswordReset({
				body: { email, redirectTo: '/reset-password' },
				headers: event.request.headers
			});
		} catch (err) {
			console.error('requestPasswordReset failed', err);
		}

		// Always respond with the same success state — never leak whether the
		// email exists.
		return { sent: true, email };
	}
};
