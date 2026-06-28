export type Role = 'user' | 'admin' | 'superadmin';

export const ASSIGNABLE_ROLES: Role[] = ['user', 'admin', 'superadmin'];

export function isAdminLike(role: string | null | undefined): boolean {
	return role === 'admin' || role === 'superadmin';
}

export function isSuperadmin(role: string | null | undefined): boolean {
	return role === 'superadmin';
}

/**
 * Superadmin is invisible/untouchable to lesser roles. A user with role
 * `admin` cannot modify, delete, or even see superadmin accounts — that's
 * what makes the root account a safe fallback if an admin goes rogue.
 */
export function canManageTarget(
	callerRole: string | null | undefined,
	targetRole: string | null | undefined
): boolean {
	if (targetRole === 'superadmin') return callerRole === 'superadmin';
	return true;
}

export function canAssignRole(
	callerRole: string | null | undefined,
	desiredRole: string | null | undefined
): boolean {
	if (desiredRole === 'superadmin') return callerRole === 'superadmin';
	return isAdminLike(callerRole);
}

// ─── Org-scoped roles ───────────────────────────────────────────────────────
// The roles stored on `organization_member.role`. These are the roles that
// actually drive the permission engine (`can()` / `deriveIsAdmin()`).
// Internal-only roles belong exclusively to the Trackr internal org; client
// orgs get the two client-side roles.

export const INTERNAL_ORG_ROLES = ['org.superadmin', 'org.admin', 'org.staff'] as const;
export const CLIENT_ORG_ROLES = ['org.client', 'org.agent', 'org.member'] as const;
export type OrgRole = (typeof INTERNAL_ORG_ROLES)[number] | (typeof CLIENT_ORG_ROLES)[number];

// Client-org roles that see ALL of their org's tickets (the "see-all" portal
// tier) and get the richer board/dashboard nav — as opposed to the
// own-tickets-only member. org.agent is a privileged member: same visibility as
// org.client, plus the ability to edit/assign tickets. Keyed by role string so
// it works on both the server and the portal client (which only has the role id).
const PORTAL_SEE_ALL_ROLES = new Set<string>(['org.client', 'org.agent']);
export function isPortalSeeAllRole(role: string | null | undefined): boolean {
	return !!role && PORTAL_SEE_ALL_ROLES.has(role);
}

export function allowedOrgRoles(isInternal: boolean): readonly OrgRole[] {
	return isInternal ? INTERNAL_ORG_ROLES : CLIENT_ORG_ROLES;
}

export function isAllowedOrgRole(role: string, isInternal: boolean): role is OrgRole {
	return (allowedOrgRoles(isInternal) as readonly string[]).includes(role);
}

/**
 * The better-auth `user.role` is derived from the org membership that grants a
 * user access, so the two role systems never drift. Only the internal Trackr
 * org can confer elevated user roles:
 *   - internal org.superadmin → 'superadmin' (root tier, impersonation)
 *   - internal org.admin      → 'admin'      (admin panel)
 *   - everything else         → 'user'       (incl. internal staff + clients)
 *
 * Internal `staff` deliberately maps to 'user': staff has no admin-panel
 * permission in the matrix, so promoting them to a better-auth admin would be
 * wrong.
 */
export function deriveUserRole(orgRole: string, isInternal: boolean): Role {
	if (!isInternal) return 'user';
	if (orgRole === 'org.superadmin') return 'superadmin';
	if (orgRole === 'org.admin') return 'admin';
	return 'user';
}
