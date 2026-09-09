// User-management policy: who may do what to whom.
//
// ONE source of truth for the role hierarchy, used by the better-auth admin
// hook (auth-admin-guard.ts), the admin form actions, and the primitives in
// api-keys.ts / mcp/access.ts / invitations.ts. Pure functions only — no db,
// no env — so the whole matrix is unit-tested (user-policy.test.ts).
//
// Rank:  user 0  <  admin 1  <  superadmin 2  <  root 3
//
// Root is the ROOT_EMAIL superadmin (user.is_root, set by the seed). Rules:
//   - an actor only ever acts on targets of equal or lower rank ("peers and
//     below"): an admin may manage another admin, a superadmin may downgrade
//     another superadmin — but nobody manages root, and nobody may grant a
//     role above their own;
//   - nobody changes their own role, through any path;
//   - only superadmins impersonate, never root, never themselves, and never
//     while already impersonating;
//   - API keys and MCP access follow the same rule; keys are admin-issued
//     (a plain user never mints their own) but everyone may revoke their own,
//     and only admin-like users may enable MCP for themselves.
// Form actions call the `can*` predicates (they need `fail(403)` + audit);
// primitives call the `assert*` twins as the backstop that does not depend on
// the UI.

import { error } from '@sveltejs/kit';
import { deriveUserRole, isAdminLike, type Role } from '$lib/roles';

/** The fields a policy decision needs; both `locals.user` and user rows satisfy it. */
export type PolicySubject = { id: string; role?: string | null; isRoot?: boolean | null };

export const RANK = { user: 0, admin: 1, superadmin: 2, root: 3 } as const;

export function rankOfRole(role: string | null | undefined): number {
	switch (role) {
		case 'superadmin':
			return RANK.superadmin;
		case 'admin':
			return RANK.admin;
		default:
			return RANK.user;
	}
}

export function isRoot(u: PolicySubject | null | undefined): boolean {
	return !!u?.isRoot;
}

/** Effective rank: root outranks every superadmin regardless of its role column. */
export function rank(u: PolicySubject): number {
	return isRoot(u) ? RANK.root : rankOfRole(u.role);
}

// ─── Predicates ─────────────────────────────────────────────────────────────

/**
 * Visibility in admin lists: everyone at or below the actor's role tier, plus
 * oneself. Root is listed like any superadmin (superadmins can see it, admins
 * can't) — hiding it would not add protection, the rules below do.
 */
export function canViewUser(actor: PolicySubject, target: PolicySubject): boolean {
	return actor.id === target.id || rankOfRole(target.role) <= rankOfRole(actor.role);
}

/** Create / invite a user with `role`, or move someone to it. */
export function canAssignRole(actor: PolicySubject, role: Role | string): boolean {
	return isAdminLike(actor.role) && rankOfRole(role) <= rank(actor);
}

/**
 * Act on a user (ban, delete, password reset / set, revoke sessions, …):
 * admin-like actor, target not root, target at or below the actor's rank.
 */
export function canManageUser(actor: PolicySubject, target: PolicySubject): boolean {
	return isAdminLike(actor.role) && !isRoot(target) && rank(target) <= rank(actor);
}

/** Change a user's role: manageable target, never oneself, new role within reach. */
export function canChangeRole(
	actor: PolicySubject,
	target: PolicySubject,
	newRole: Role | string
): boolean {
	return (
		canManageUser(actor, target) && actor.id !== target.id && rankOfRole(newRole) <= rank(actor)
	);
}

export function canImpersonate(
	actor: PolicySubject,
	target: PolicySubject,
	opts: { actorImpersonating?: boolean } = {}
): boolean {
	return (
		rank(actor) >= RANK.superadmin &&
		!opts.actorImpersonating &&
		!isRoot(target) &&
		actor.id !== target.id &&
		rank(target) <= rank(actor)
	);
}

/**
 * Issue a trk_ key. Keys are admin-issued: a plain user never mints their own
 * (admins and superadmins may, for themselves and for peers-and-below). A key
 * acts as its owner, so minting one for someone else is impersonation-grade.
 */
export function canCreateApiKeyFor(actor: PolicySubject, target: PolicySubject): boolean {
	if (actor.id === target.id) return isAdminLike(actor.role);
	return canManageUser(actor, target);
}

/** Revoke / delete a key: everyone may kill a credential that acts as them. */
export function canManageApiKeyFor(actor: PolicySubject, target: PolicySubject): boolean {
	if (actor.id === target.id) return true;
	return canManageUser(actor, target);
}

/** MCP enablement / connection revocation for a user. */
export function canManageMcpFor(actor: PolicySubject, target: PolicySubject): boolean {
	if (actor.id === target.id) return isAdminLike(actor.role);
	return canManageUser(actor, target);
}

/**
 * Internal-org membership roles map onto the better-auth tier
 * (org.superadmin → superadmin, org.admin → admin, org.staff → user), so
 * setting one is a role change and follows the same rule.
 */
export function canSetInternalOrgRole(
	actor: PolicySubject,
	target: PolicySubject,
	orgRole: string
): boolean {
	return canChangeRole(actor, target, deriveUserRole(orgRole, true));
}

/** Removing an internal-org membership demotes the user to the plain tier. */
export function canRemoveInternalOrgMember(actor: PolicySubject, target: PolicySubject): boolean {
	return canChangeRole(actor, target, 'user');
}

// ─── Assertions (throw kit 403) ─────────────────────────────────────────────

export const POLICY_DENIED_MESSAGE = 'You are not allowed to perform this action on this user.';
export const ROOT_UNTOUCHABLE_MESSAGE = 'The root account cannot be modified.';

function deny(target?: PolicySubject): never {
	error(403, isRoot(target) ? ROOT_UNTOUCHABLE_MESSAGE : POLICY_DENIED_MESSAGE);
}

export function assertCanAssignRole(actor: PolicySubject, role: Role | string): void {
	if (!canAssignRole(actor, role)) deny();
}
export function assertCanManageUser(actor: PolicySubject, target: PolicySubject): void {
	if (!canManageUser(actor, target)) deny(target);
}
export function assertCanChangeRole(
	actor: PolicySubject,
	target: PolicySubject,
	newRole: Role | string
): void {
	if (!canChangeRole(actor, target, newRole)) deny(target);
}
export function assertCanImpersonate(
	actor: PolicySubject,
	target: PolicySubject,
	opts: { actorImpersonating?: boolean } = {}
): void {
	if (!canImpersonate(actor, target, opts)) deny(target);
}
export function assertCanCreateApiKeyFor(actor: PolicySubject, target: PolicySubject): void {
	if (!canCreateApiKeyFor(actor, target)) deny(target);
}
export function assertCanManageApiKeyFor(actor: PolicySubject, target: PolicySubject): void {
	if (!canManageApiKeyFor(actor, target)) deny(target);
}
export function assertCanManageMcpFor(actor: PolicySubject, target: PolicySubject): void {
	if (!canManageMcpFor(actor, target)) deny(target);
}
export function assertCanSetInternalOrgRole(
	actor: PolicySubject,
	target: PolicySubject,
	orgRole: string
): void {
	if (!canSetInternalOrgRole(actor, target, orgRole)) deny(target);
}
export function assertCanRemoveInternalOrgMember(
	actor: PolicySubject,
	target: PolicySubject
): void {
	if (!canRemoveInternalOrgMember(actor, target)) deny(target);
}
