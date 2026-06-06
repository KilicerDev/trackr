import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { eq, isNull } from 'drizzle-orm';
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
import { organization, organizationMember } from '$lib/server/db/app.schema';
import { asc, desc } from 'drizzle-orm';
import {
	canAssignRole,
	canManageTarget,
	deriveUserRole,
	isAdminLike,
	isAllowedOrgRole,
	isSuperadmin
} from '$lib/roles';
import { m } from '$lib/paraglide/messages';
import type { Actions, PageServerLoad } from './$types';

function roleOf(u: unknown): string | null | undefined {
	return (u as { role?: string | null } | undefined)?.role;
}

function s(value: FormDataEntryValue | null): string {
	return value?.toString().trim() ?? '';
}

type ResolvedOrg =
	| { ok: true; orgId: string; orgRole: string; isInternal: boolean }
	| { ok: false; status: number; message: string };

// Validate the org + org-role chosen in the form. The org-role is the source of
// truth; the better-auth user.role is derived from it downstream.
async function resolveOrgRole(form: FormData): Promise<ResolvedOrg> {
	const orgId = s(form.get('orgId'));
	const orgRole = s(form.get('orgRole'));
	if (!orgId || !orgRole) {
		return { ok: false, status: 400, message: m.admin_users_pick_org_role() };
	}
	const [org] = await db
		.select({ id: organization.id, isInternal: organization.isInternal })
		.from(organization)
		.where(eq(organization.id, orgId))
		.limit(1);
	if (!org) return { ok: false, status: 404, message: m.admin_err_org_not_found() };
	if (!isAllowedOrgRole(orgRole, org.isInternal)) {
		return { ok: false, status: 400, message: m.admin_err_role_invalid({ role: orgRole }) };
	}
	return { ok: true, orgId, orgRole, isInternal: org.isInternal };
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

	// Orgs the admin can place the new user into. The role picker is derived
	// client-side from `isInternal`.
	const orgs = await db
		.select({
			id: organization.id,
			name: organization.name,
			color: organization.color,
			isInternal: organization.isInternal
		})
		.from(organization)
		.where(isNull(organization.archivedAt))
		.orderBy(desc(organization.isInternal), asc(organization.name));

	return {
		users: viewerIsSuperadmin ? list.users : list.users.filter((u) => !isSuperadmin(u.role)),
		invitations: viewerIsSuperadmin
			? invitations
			: invitations.filter((inv) => !isSuperadmin(inv.role)),
		currentUserId: event.locals.user!.id,
		viewerIsSuperadmin,
		orgs
	};
};

export const actions: Actions = {
	createUser: async (event) => {
		const callerRole = roleOf(event.locals.user);
		if (!isAdminLike(callerRole)) {
			return fail(403, { message: m.admin_err_admin_required() });
		}

		const form = await event.request.formData();
		const name = s(form.get('name'));
		const email = s(form.get('email')).toLowerCase();
		const password = form.get('password')?.toString() ?? '';

		if (!name || !email || password.length < 8) {
			return fail(400, {
				message: m.admin_err_create_user_fields()
			});
		}

		const resolved = await resolveOrgRole(form);
		if (!resolved.ok) return fail(resolved.status, { message: resolved.message });

		const role = deriveUserRole(resolved.orgRole, resolved.isInternal);
		if (!canAssignRole(callerRole, role)) {
			return fail(403, { message: m.admin_err_cannot_assign_role() });
		}

		try {
			const created = await auth.api.createUser({
				body: { name, email, password, role: role as 'admin' | 'user' },
				headers: event.request.headers
			});
			// Grant the org membership that makes the role meaningful.
			await db
				.insert(organizationMember)
				.values({ orgId: resolved.orgId, userId: created.user.id, role: resolved.orgRole })
				.onConflictDoUpdate({
					target: [organizationMember.orgId, organizationMember.userId],
					set: { role: resolved.orgRole }
				});
		} catch (err) {
			if (err instanceof APIError) {
				return fail(400, { message: err.message || m.admin_users_create_failed() });
			}
			return fail(500, { message: m.admin_err_generic() });
		}

		return { ok: true };
	},

	inviteUser: async (event) => {
		const callerRole = roleOf(event.locals.user);
		if (!isAdminLike(callerRole)) {
			return fail(403, { message: m.admin_err_admin_required() });
		}

		const form = await event.request.formData();
		const name = s(form.get('name'));
		const email = s(form.get('email')).toLowerCase();

		if (!name || !email) {
			return fail(400, { message: m.admin_err_name_email_required() });
		}

		const resolved = await resolveOrgRole(form);
		if (!resolved.ok) return fail(resolved.status, { message: resolved.message });

		const role = deriveUserRole(resolved.orgRole, resolved.isInternal);
		if (!canAssignRole(callerRole, role)) {
			return fail(403, { message: m.admin_err_cannot_invite_role() });
		}

		try {
			const { invitation, acceptUrl } = await createOrRefreshInvitation({
				email,
				name,
				role,
				orgId: resolved.orgId,
				orgRole: resolved.orgRole,
				invitedBy: event.locals.user?.id ?? null,
				origin: event.url.origin
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
			return fail(500, { message: m.admin_users_invite_failed() });
		}

		return { ok: true };
	},

	resendInvitation: async (event) => {
		const callerRole = roleOf(event.locals.user);
		if (!isAdminLike(callerRole)) {
			return fail(403, { message: m.admin_err_admin_required() });
		}

		const form = await event.request.formData();
		const id = s(form.get('id'));
		if (!id) return fail(400, { message: m.admin_err_missing_invitation_id() });

		const existing = await getInvitationById(id);
		if (!existing) return fail(404, { message: m.admin_err_invitation_gone() });
		if (!canAssignRole(callerRole, existing.role)) {
			return fail(403, { message: m.admin_err_invitation_not_found() });
		}

		try {
			const { invitation, acceptUrl } = await createOrRefreshInvitation({
				email: existing.email,
				name: existing.name,
				role: (existing.role as InvitationRole) ?? 'user',
				orgId: existing.orgId,
				orgRole: existing.orgRole,
				invitedBy: event.locals.user?.id ?? existing.invitedBy,
				origin: event.url.origin
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
			return fail(500, { message: m.admin_err_resend_failed() });
		}

		return { ok: true };
	},

	revokeInvitation: async (event) => {
		const callerRole = roleOf(event.locals.user);
		if (!isAdminLike(callerRole)) {
			return fail(403, { message: m.admin_err_admin_required() });
		}

		const form = await event.request.formData();
		const id = s(form.get('id'));
		if (!id) return fail(400, { message: m.admin_err_missing_invitation_id() });

		const existing = await getInvitationById(id);
		if (!existing) return { ok: true };
		if (!canAssignRole(callerRole, existing.role)) {
			return fail(403, { message: m.admin_err_invitation_not_found() });
		}

		await revokeInvitation(id);
		return { ok: true };
	},

	impersonateUser: async (event) => {
		const callerRole = roleOf(event.locals.user);
		if (!isSuperadmin(callerRole)) {
			return fail(403, { message: m.admin_err_superadmin_required() });
		}

		const form = await event.request.formData();
		const userId = s(form.get('userId'));
		if (!userId) return fail(400, { message: m.admin_err_missing_user_id() });
		if (userId === event.locals.user?.id) {
			return fail(400, { message: m.admin_err_impersonate_self() });
		}

		const [target] = await db
			.select({ id: userTable.id, email: userTable.email, role: userTable.role })
			.from(userTable)
			.where(eq(userTable.id, userId))
			.limit(1);
		if (!target) return fail(404, { message: m.admin_err_user_not_found() });

		try {
			await auth.api.impersonateUser({
				body: { userId },
				headers: event.request.headers
			});
		} catch (err) {
			if (err instanceof APIError) {
				return fail(400, { message: err.message || m.admin_err_impersonate_failed() });
			}
			console.error('impersonateUser failed', err);
			return fail(500, { message: m.admin_err_generic() });
		}

		return { ok: true };
	},

	sendPasswordReset: async (event) => {
		const callerRole = roleOf(event.locals.user);
		if (!isAdminLike(callerRole)) {
			return fail(403, { message: m.admin_err_admin_required() });
		}

		const form = await event.request.formData();
		const userId = s(form.get('userId'));
		if (!userId) return fail(400, { message: m.admin_err_missing_user_id() });

		const [target] = await db
			.select({ id: userTable.id, email: userTable.email, role: userTable.role })
			.from(userTable)
			.where(eq(userTable.id, userId))
			.limit(1);
		if (!target) return fail(404, { message: m.admin_err_user_not_found() });
		if (!canManageTarget(callerRole, target.role)) {
			return fail(404, { message: m.admin_err_user_not_found() });
		}

		try {
			await auth.api.requestPasswordReset({
				body: { email: target.email, redirectTo: '/reset-password' },
				headers: event.request.headers
			});
		} catch (err) {
			console.error('sendPasswordReset failed', err);
			return fail(500, { message: m.admin_err_password_reset_failed() });
		}

		return { ok: true };
	},

	deleteUser: async (event) => {
		const callerRole = roleOf(event.locals.user);
		if (!isAdminLike(callerRole)) {
			return fail(403, { message: m.admin_err_admin_required() });
		}

		const form = await event.request.formData();
		const userId = s(form.get('userId'));
		if (!userId) return fail(400, { message: m.admin_err_missing_user_id() });
		if (userId === event.locals.user?.id) {
			return fail(400, { message: m.admin_err_delete_self() });
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
		if (!target) return fail(404, { message: m.admin_err_user_not_found() });
		if (!canManageTarget(callerRole, target.role)) {
			return fail(404, { message: m.admin_err_user_not_found() });
		}

		try {
			await auth.api.removeUser({
				body: { userId },
				headers: event.request.headers
			});
		} catch (err) {
			if (err instanceof APIError) {
				return fail(400, { message: err.message || m.admin_err_delete_user_failed() });
			}
			return fail(500, { message: m.admin_err_generic() });
		}

		return { ok: true };
	}
};
