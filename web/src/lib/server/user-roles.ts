// Keeps the better-auth `user.role` tier in step with internal-org membership.
//
// Two role systems exist: `organization_member.role` drives the permission
// matrix, `user.role` drives better-auth (admin panel access, impersonation,
// who-may-see-whom). `deriveUserRole` maps the first onto the second, but it
// used to run only on create/invite — every later membership edit left
// `user.role` stale. Call `syncUserRoleFromMemberships` after any write to an
// internal-org membership so the two never drift again.

import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { organization, organizationMember } from '$lib/server/db/app.schema';
import { user } from '$lib/server/db/auth.schema';
import { deriveUserRole, type Role } from '$lib/roles';
import { rankOfRole } from '$lib/server/user-policy';

/**
 * Recompute and persist `user.role` from the user's internal-org memberships
 * (highest wins; none → 'user'). Root is never touched — it stays
 * superadmin whatever its membership row says. Returns the effective role.
 */
export async function syncUserRoleFromMemberships(userId: string): Promise<Role | null> {
	const [row] = await db
		.select({ role: user.role, isRoot: user.isRoot })
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	if (!row) return null;
	if (row.isRoot) return 'superadmin';

	const memberships = await db
		.select({ role: organizationMember.role })
		.from(organizationMember)
		.innerJoin(organization, eq(organization.id, organizationMember.orgId))
		.where(and(eq(organizationMember.userId, userId), eq(organization.isInternal, true)));

	let derived: Role = 'user';
	for (const m of memberships) {
		const r = deriveUserRole(m.role, true);
		if (rankOfRole(r) > rankOfRole(derived)) derived = r;
	}
	if (row.role !== derived) {
		// Direct write: `role` is input:false for better-auth, and this is the
		// same path the root seed uses.
		await db.update(user).set({ role: derived, updatedAt: new Date() }).where(eq(user.id, userId));
	}
	return derived;
}
