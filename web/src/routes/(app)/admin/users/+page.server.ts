import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { eq, inArray, isNull } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { sendEmail, invitationEmail, EMAIL_PRIORITY } from '$lib/server/jobs';
import {
	createOrRefreshInvitation,
	getInvitationById,
	listPendingInvitations,
	revokeInvitation,
	type InvitationRole
} from '$lib/server/invitations';
import { db } from '$lib/server/db';
import { recordAudit } from '$lib/server/audit';
import { user as userTable } from '$lib/server/db/auth.schema';
import { organization, organizationMember } from '$lib/server/db/app.schema';
import { asc, desc } from 'drizzle-orm';
import { deriveUserRole, isAdminLike, isAllowedOrgRole, isSuperadmin } from '$lib/roles';
import {
	canAssignRole,
	canImpersonate,
	canManageUser,
	canViewUser,
	isRoot,
	rankOfRole,
	type PolicySubject
} from '$lib/server/user-policy';
import { m } from '$lib/paraglide/messages';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * The signed-in admin as a policy subject, or null. Every action starts here;
 * the /admin hook already refused anonymous and non-admin callers, this is
 * the in-file backstop.
 */
function actorOf(event: RequestEvent): (PolicySubject & { id: string; name: string }) | null {
	const u = event.locals.user;
	return u && isAdminLike(u.role) ? u : null;
}

/** Audit a refused user-management attempt (the policy said no). */
function denied(
	event: RequestEvent,
	reason: string,
	target?: { id?: string | null; email?: string | null } | null
) {
	void recordAudit(
		{
			type: 'authz.denied',
			actorId: event.locals.user?.id ?? null,
			actorLabel: event.locals.user?.email ?? null,
			targetType: target ? 'user' : null,
			targetId: target?.id ?? null,
			targetLabel: target?.email ?? null,
			meta: { path: event.url.pathname, action: event.url.search.slice(2), reason }
		},
		event
	);
}

/** 403 message for a target the actor may see but not act on. */
function rankMessage(target: PolicySubject): string {
	return isRoot(target) ? m.admin_err_root_untouchable() : m.admin_err_rank();
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
	const me = actorOf(event);
	if (!me) {
		redirect(303, '/');
	}

	const list = await auth.api.listUsers({
		query: { limit: '200', sortBy: 'createdAt', sortDirection: 'desc' },
		headers: event.request.headers
	});
	const invitations = await listPendingInvitations();

	const viewerIsSuperadmin = isSuperadmin(me.role);

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

	// Same tier or below only (admins never see superadmins). `isRoot` rides
	// along so the drawer can hide actions the policy would refuse anyway.
	const users = list.users
		.filter((u) => canViewUser(me, u as PolicySubject))
		.map((u) => ({ ...u, isRoot: !!(u as PolicySubject).isRoot }));

	// Org memberships per listed user — surfaced in the detail drawer so an admin
	// can see which organizations (and at what role) a user belongs to.
	const userIds = users.map((u) => u.id);
	const memberRows = userIds.length
		? await db
				.select({
					userId: organizationMember.userId,
					role: organizationMember.role,
					orgId: organization.id,
					orgName: organization.name,
					orgColor: organization.color,
					isInternal: organization.isInternal
				})
				.from(organizationMember)
				.innerJoin(organization, eq(organization.id, organizationMember.orgId))
				.where(inArray(organizationMember.userId, userIds))
		: [];
	const orgMemberships: Record<
		string,
		{ id: string; name: string; color: string; role: string; isInternal: boolean }[]
	> = {};
	for (const r of memberRows) {
		(orgMemberships[r.userId] ??= []).push({
			id: r.orgId,
			name: r.orgName,
			color: r.orgColor,
			role: r.role,
			isInternal: r.isInternal
		});
	}
	// Internal org(s) first, then alphabetical — matches the create-user org picker.
	for (const memberships of Object.values(orgMemberships)) {
		memberships.sort(
			(a, b) => Number(b.isInternal) - Number(a.isInternal) || a.name.localeCompare(b.name)
		);
	}

	return {
		users,
		invitations: invitations.filter((inv) => rankOfRole(inv.role) <= rankOfRole(me.role)),
		currentUserId: event.locals.user!.id,
		viewerIsSuperadmin,
		orgs,
		orgMemberships
	};
};

export const actions: Actions = {
	createUser: async (event) => {
		const me = actorOf(event);
		if (!me) return fail(403, { message: m.admin_err_admin_required() });

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
		if (!canAssignRole(me, role)) {
			denied(event, 'assign_role');
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
			void recordAudit(
				{
					type: 'user.create',
					actorId: event.locals.user?.id ?? null,
					targetType: 'user',
					targetId: created.user.id,
					targetLabel: email,
					meta: { role, orgRole: resolved.orgRole }
				},
				event
			);
		} catch (err) {
			if (err instanceof APIError) {
				return fail(400, { message: err.message || m.admin_users_create_failed() });
			}
			return fail(500, { message: m.admin_err_generic() });
		}

		return { ok: true };
	},

	inviteUser: async (event) => {
		const me = actorOf(event);
		if (!me) return fail(403, { message: m.admin_err_admin_required() });

		const form = await event.request.formData();
		const name = s(form.get('name'));
		const email = s(form.get('email')).toLowerCase();

		if (!name || !email) {
			return fail(400, { message: m.admin_err_name_email_required() });
		}

		const resolved = await resolveOrgRole(form);
		if (!resolved.ok) return fail(resolved.status, { message: resolved.message });

		const role = deriveUserRole(resolved.orgRole, resolved.isInternal);
		if (!canAssignRole(me, role)) {
			denied(event, 'assign_role');
			return fail(403, { message: m.admin_err_cannot_invite_role() });
		}

		try {
			const { invitation, acceptUrl } = await createOrRefreshInvitation({
				email,
				name,
				role,
				orgId: resolved.orgId,
				orgRole: resolved.orgRole,
				actor: me,
				origin: event.url.origin
			});
			await sendEmail(
				invitationEmail({
					to: invitation.email,
					name: invitation.name,
					inviterName: event.locals.user?.name,
					acceptUrl,
					expiresAt: invitation.expiresAt
				}),
				{ priority: EMAIL_PRIORITY.high }
			);
			void recordAudit(
				{
					type: 'user.invite',
					actorId: event.locals.user?.id ?? null,
					targetType: 'user',
					targetLabel: invitation.email,
					meta: { role, orgRole: resolved.orgRole }
				},
				event
			);
		} catch (err) {
			console.error('inviteUser failed', err);
			return fail(500, { message: m.admin_users_invite_failed() });
		}

		return { ok: true };
	},

	resendInvitation: async (event) => {
		const me = actorOf(event);
		if (!me) return fail(403, { message: m.admin_err_admin_required() });

		const form = await event.request.formData();
		const id = s(form.get('id'));
		if (!id) return fail(400, { message: m.admin_err_missing_invitation_id() });

		const existing = await getInvitationById(id);
		if (!existing) return fail(404, { message: m.admin_err_invitation_gone() });
		if (!canAssignRole(me, existing.role ?? 'user')) {
			denied(event, 'assign_role');
			return fail(403, { message: m.admin_err_invitation_not_found() });
		}

		try {
			const { invitation, acceptUrl } = await createOrRefreshInvitation({
				email: existing.email,
				name: existing.name,
				role: (existing.role as InvitationRole) ?? 'user',
				orgId: existing.orgId,
				orgRole: existing.orgRole,
				actor: me,
				origin: event.url.origin
			});
			await sendEmail(
				invitationEmail({
					to: invitation.email,
					name: invitation.name,
					inviterName: event.locals.user?.name,
					acceptUrl,
					expiresAt: invitation.expiresAt
				}),
				{ priority: EMAIL_PRIORITY.high }
			);
			void recordAudit(
				{
					type: 'user.invite',
					actorId: event.locals.user?.id ?? null,
					targetType: 'user',
					targetLabel: invitation.email,
					meta: { resend: true }
				},
				event
			);
		} catch (err) {
			console.error('resendInvitation failed', err);
			return fail(500, { message: m.admin_err_resend_failed() });
		}

		return { ok: true };
	},

	revokeInvitation: async (event) => {
		const me = actorOf(event);
		if (!me) return fail(403, { message: m.admin_err_admin_required() });

		const form = await event.request.formData();
		const id = s(form.get('id'));
		if (!id) return fail(400, { message: m.admin_err_missing_invitation_id() });

		const existing = await getInvitationById(id);
		if (!existing) return { ok: true };
		if (!canAssignRole(me, existing.role ?? 'user')) {
			denied(event, 'assign_role');
			return fail(403, { message: m.admin_err_invitation_not_found() });
		}

		await revokeInvitation(id);
		void recordAudit(
			{
				type: 'user.invite_revoke',
				actorId: event.locals.user?.id ?? null,
				targetType: 'user',
				targetLabel: existing.email,
				meta: { invitationId: id }
			},
			event
		);
		return { ok: true };
	},

	impersonateUser: async (event) => {
		const me = actorOf(event);
		if (!me || !isSuperadmin(me.role)) {
			return fail(403, { message: m.admin_err_superadmin_required() });
		}

		const form = await event.request.formData();
		const userId = s(form.get('userId'));
		if (!userId) return fail(400, { message: m.admin_err_missing_user_id() });
		if (userId === event.locals.user?.id) {
			return fail(400, { message: m.admin_err_impersonate_self() });
		}

		const [target] = await db
			.select({
				id: userTable.id,
				email: userTable.email,
				role: userTable.role,
				isRoot: userTable.isRoot
			})
			.from(userTable)
			.where(eq(userTable.id, userId))
			.limit(1);
		if (!target) return fail(404, { message: m.admin_err_user_not_found() });
		// Never root, never a higher rank, never from inside an impersonation.
		const impersonating = !!(event.locals.session as { impersonatedBy?: string | null } | undefined)
			?.impersonatedBy;
		if (!canImpersonate(me, target, { actorImpersonating: impersonating })) {
			denied(event, 'impersonate', target);
			return fail(403, { message: rankMessage(target) });
		}

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

		void recordAudit(
			{
				type: 'user.impersonate',
				actorId: event.locals.user?.id ?? null,
				targetType: 'user',
				targetId: target.id,
				targetLabel: target.email
			},
			event
		);
		return { ok: true };
	},

	sendPasswordReset: async (event) => {
		const me = actorOf(event);
		if (!me) return fail(403, { message: m.admin_err_admin_required() });

		const form = await event.request.formData();
		const userId = s(form.get('userId'));
		if (!userId) return fail(400, { message: m.admin_err_missing_user_id() });

		const [target] = await db
			.select({
				id: userTable.id,
				email: userTable.email,
				role: userTable.role,
				isRoot: userTable.isRoot
			})
			.from(userTable)
			.where(eq(userTable.id, userId))
			.limit(1);
		// Invisible tiers answer 404 (don't reveal the account); visible but
		// out-of-reach ones (root, for a superadmin) answer 403.
		if (!target || !canViewUser(me, target)) {
			return fail(404, { message: m.admin_err_user_not_found() });
		}
		if (!canManageUser(me, target)) {
			denied(event, 'password_reset', target);
			return fail(403, { message: rankMessage(target) });
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

		void recordAudit(
			{
				type: 'user.password_reset',
				actorId: event.locals.user?.id ?? null,
				targetType: 'user',
				targetId: target.id,
				targetLabel: target.email
			},
			event
		);
		return { ok: true };
	},

	deleteUser: async (event) => {
		const me = actorOf(event);
		if (!me) return fail(403, { message: m.admin_err_admin_required() });

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
				role: userTable.role,
				isRoot: userTable.isRoot
			})
			.from(userTable)
			.where(eq(userTable.id, userId))
			.limit(1);
		if (!target || !canViewUser(me, target)) {
			return fail(404, { message: m.admin_err_user_not_found() });
		}
		if (!canManageUser(me, target)) {
			denied(event, 'delete', target);
			return fail(403, { message: rankMessage(target) });
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

		void recordAudit(
			{
				type: 'user.delete',
				actorId: event.locals.user?.id ?? null,
				targetType: 'user',
				targetId: target.id,
				targetLabel: target.name ?? target.email,
				meta: { email: target.email }
			},
			event
		);
		return { ok: true };
	}
};
