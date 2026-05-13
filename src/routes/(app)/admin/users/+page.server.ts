import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { sendEmail } from '$lib/server/email';
import { invitationEmail } from '$lib/server/email/templates';
import {
	createOrRefreshInvitation,
	getInvitationById,
	listPendingInvitations,
	revokeInvitation,
	type InvitationRole
} from '$lib/server/invitations';
import { db } from '$lib/server/db';
import { user as userTable } from '$lib/server/db/auth.schema';
import { canAssignRole, canManageTarget, isAdminLike, isSuperadmin, type Role } from '$lib/roles';
import type { Actions, PageServerLoad } from './$types';

function roleOf(u: unknown): string | null | undefined {
	return (u as { role?: string | null } | undefined)?.role;
}

function asRole(value: FormDataEntryValue | null): Role {
	if (value === 'admin') return 'admin';
	if (value === 'superadmin') return 'superadmin';
	return 'user';
}

function s(value: FormDataEntryValue | null): string {
	return value?.toString().trim() ?? '';
}

export const load: PageServerLoad = async (event) => {
	const callerRole = roleOf(event.locals.user);
	if (!isAdminLike(callerRole)) {
		redirect(303, '/');
	}

	const list = await auth.api.listUsers({
		query: { limit: '200', sortBy: 'createdAt', sortDirection: 'desc' },
		headers: event.request.headers
	});
	const invitations = await listPendingInvitations();

	const viewerIsSuperadmin = isSuperadmin(callerRole);

	return {
		users: viewerIsSuperadmin ? list.users : list.users.filter((u) => !isSuperadmin(u.role)),
		invitations: viewerIsSuperadmin
			? invitations
			: invitations.filter((inv) => !isSuperadmin(inv.role)),
		currentUserId: event.locals.user!.id,
		viewerIsSuperadmin
	};
};

export const actions: Actions = {
	createUser: async (event) => {
		const callerRole = roleOf(event.locals.user);
		if (!isAdminLike(callerRole)) {
			return fail(403, { message: 'Admin access required.' });
		}

		const form = await event.request.formData();
		const name = s(form.get('name'));
		const email = s(form.get('email')).toLowerCase();
		const password = form.get('password')?.toString() ?? '';
		const role = asRole(form.get('role'));

		if (!name || !email || password.length < 8) {
			return fail(400, {
				message: 'Name, email, and a password of at least 8 characters are required.'
			});
		}
		if (!canAssignRole(callerRole, role)) {
			return fail(403, { message: 'You cannot assign that role.' });
		}

		try {
			await auth.api.createUser({
				body: { name, email, password, role: role as 'admin' | 'user' },
				headers: event.request.headers
			});
		} catch (err) {
			if (err instanceof APIError) {
				return fail(400, { message: err.message || 'Failed to create user.' });
			}
			return fail(500, { message: 'Something went wrong. Please try again.' });
		}

		return { ok: true };
	},

	inviteUser: async (event) => {
		const callerRole = roleOf(event.locals.user);
		if (!isAdminLike(callerRole)) {
			return fail(403, { message: 'Admin access required.' });
		}

		const form = await event.request.formData();
		const name = s(form.get('name'));
		const email = s(form.get('email')).toLowerCase();
		const role = asRole(form.get('role'));

		if (!name || !email) {
			return fail(400, { message: 'Name and email are required.' });
		}
		if (!canAssignRole(callerRole, role)) {
			return fail(403, { message: 'You cannot invite at that role.' });
		}

		try {
			const { invitation, acceptUrl } = await createOrRefreshInvitation({
				email,
				name,
				role,
				invitedBy: event.locals.user?.id ?? null
			});
			await sendEmail(
				invitationEmail({
					to: invitation.email,
					name: invitation.name,
					inviterName: event.locals.user?.name,
					acceptUrl,
					expiresAt: invitation.expiresAt
				})
			);
		} catch (err) {
			console.error('inviteUser failed', err);
			return fail(500, { message: 'Failed to send invitation.' });
		}

		return { ok: true };
	},

	resendInvitation: async (event) => {
		const callerRole = roleOf(event.locals.user);
		if (!isAdminLike(callerRole)) {
			return fail(403, { message: 'Admin access required.' });
		}

		const form = await event.request.formData();
		const id = s(form.get('id'));
		if (!id) return fail(400, { message: 'Missing invitation id.' });

		const existing = await getInvitationById(id);
		if (!existing) return fail(404, { message: 'Invitation no longer exists.' });
		if (!canAssignRole(callerRole, existing.role)) {
			return fail(403, { message: 'Invitation not found.' });
		}

		try {
			const { invitation, acceptUrl } = await createOrRefreshInvitation({
				email: existing.email,
				name: existing.name,
				role: (existing.role as InvitationRole) ?? 'user',
				invitedBy: event.locals.user?.id ?? existing.invitedBy
			});
			await sendEmail(
				invitationEmail({
					to: invitation.email,
					name: invitation.name,
					inviterName: event.locals.user?.name,
					acceptUrl,
					expiresAt: invitation.expiresAt
				})
			);
		} catch (err) {
			console.error('resendInvitation failed', err);
			return fail(500, { message: 'Failed to resend invitation.' });
		}

		return { ok: true };
	},

	revokeInvitation: async (event) => {
		const callerRole = roleOf(event.locals.user);
		if (!isAdminLike(callerRole)) {
			return fail(403, { message: 'Admin access required.' });
		}

		const form = await event.request.formData();
		const id = s(form.get('id'));
		if (!id) return fail(400, { message: 'Missing invitation id.' });

		const existing = await getInvitationById(id);
		if (!existing) return { ok: true };
		if (!canAssignRole(callerRole, existing.role)) {
			return fail(403, { message: 'Invitation not found.' });
		}

		await revokeInvitation(id);
		return { ok: true };
	},

	impersonateUser: async (event) => {
		const callerRole = roleOf(event.locals.user);
		if (!isSuperadmin(callerRole)) {
			return fail(403, { message: 'Superadmin access required.' });
		}

		const form = await event.request.formData();
		const userId = s(form.get('userId'));
		if (!userId) return fail(400, { message: 'Missing user id.' });
		if (userId === event.locals.user?.id) {
			return fail(400, { message: 'You cannot impersonate yourself.' });
		}

		const [target] = await db
			.select({ id: userTable.id, email: userTable.email, role: userTable.role })
			.from(userTable)
			.where(eq(userTable.id, userId))
			.limit(1);
		if (!target) return fail(404, { message: 'User not found.' });

		try {
			await auth.api.impersonateUser({
				body: { userId },
				headers: event.request.headers
			});
		} catch (err) {
			if (err instanceof APIError) {
				return fail(400, { message: err.message || 'Failed to start impersonation.' });
			}
			console.error('impersonateUser failed', err);
			return fail(500, { message: 'Something went wrong. Please try again.' });
		}

		return { ok: true };
	},

	sendPasswordReset: async (event) => {
		const callerRole = roleOf(event.locals.user);
		if (!isAdminLike(callerRole)) {
			return fail(403, { message: 'Admin access required.' });
		}

		const form = await event.request.formData();
		const userId = s(form.get('userId'));
		if (!userId) return fail(400, { message: 'Missing user id.' });

		const [target] = await db
			.select({ id: userTable.id, email: userTable.email, role: userTable.role })
			.from(userTable)
			.where(eq(userTable.id, userId))
			.limit(1);
		if (!target) return fail(404, { message: 'User not found.' });
		if (!canManageTarget(callerRole, target.role)) {
			return fail(404, { message: 'User not found.' });
		}

		try {
			await auth.api.requestPasswordReset({
				body: { email: target.email, redirectTo: '/reset-password' },
				headers: event.request.headers
			});
		} catch (err) {
			console.error('sendPasswordReset failed', err);
			return fail(500, { message: 'Failed to send password reset email.' });
		}

		return { ok: true };
	},

	deleteUser: async (event) => {
		const callerRole = roleOf(event.locals.user);
		if (!isAdminLike(callerRole)) {
			return fail(403, { message: 'Admin access required.' });
		}

		const form = await event.request.formData();
		const userId = s(form.get('userId'));
		if (!userId) return fail(400, { message: 'Missing user id.' });
		if (userId === event.locals.user?.id) {
			return fail(400, { message: 'You cannot delete yourself.' });
		}

		const [target] = await db
			.select({
				id: userTable.id,
				name: userTable.name,
				email: userTable.email,
				role: userTable.role
			})
			.from(userTable)
			.where(eq(userTable.id, userId))
			.limit(1);
		if (!target) return fail(404, { message: 'User not found.' });
		if (!canManageTarget(callerRole, target.role)) {
			return fail(404, { message: 'User not found.' });
		}

		try {
			await auth.api.removeUser({
				body: { userId },
				headers: event.request.headers
			});
		} catch (err) {
			if (err instanceof APIError) {
				return fail(400, { message: err.message || 'Failed to delete user.' });
			}
			return fail(500, { message: 'Something went wrong. Please try again.' });
		}

		return { ok: true };
	}
};
