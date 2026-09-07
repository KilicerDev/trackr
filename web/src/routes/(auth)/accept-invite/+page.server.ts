import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { auth } from '$lib/server/auth';
import { acceptInvitation, findInvitationByToken } from '$lib/server/invitations';
import { recordAudit } from '$lib/server/audit';
import { m } from '$lib/paraglide/messages';
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

		if (!token) return fail(400, { message: m.auth_invite_missing_token() });
		if (password.length < 8) {
			return fail(400, { message: m.auth_password_min_chars({ min: 8 }) });
		}

		const result = await acceptInvitation({ token, password });
		if (!result.ok) {
			if (result.reason === 'invalid_token') {
				return fail(400, { message: m.auth_invite_link_invalid() });
			}
			return fail(400, { message: m.auth_invite_account_exists() });
		}
		// The one place a user row (with a role) is created outside better-auth.
		void recordAudit(
			{
				type: 'user.invite_accept',
				actorId: result.userId,
				actorLabel: result.email,
				targetType: 'user',
				targetId: result.userId,
				targetLabel: result.email,
				meta: {
					invitationId: result.invitationId,
					invitedBy: result.invitedBy,
					role: result.role,
					orgRole: result.orgRole
				}
			},
			event
		);

		try {
			await auth.api.signInEmail({
				body: { email: result.email, password },
				headers: event.request.headers
			});
		} catch (err) {
			if (err instanceof APIError) {
				return fail(500, {
					message: err.message || m.auth_invite_signin_failed()
				});
			}
			return fail(500, { message: m.auth_invite_signin_failed() });
		}

		redirect(303, '/');
	}
};
