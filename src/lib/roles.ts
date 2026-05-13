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
