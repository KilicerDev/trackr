import { describe, expect, test } from 'bun:test';
import {
	assertCanChangeRole,
	assertCanImpersonate,
	assertCanManageApiKeyFor,
	assertCanManageUser,
	canAssignRole,
	canChangeRole,
	canImpersonate,
	canManageApiKeyFor,
	canManageMcpFor,
	canManageUser,
	canRemoveInternalOrgMember,
	canSetInternalOrgRole,
	canViewUser,
	isRoot,
	POLICY_DENIED_MESSAGE,
	rank,
	rankOfRole,
	ROOT_UNTOUCHABLE_MESSAGE
} from './user-policy';

const root = { id: 'root', role: 'superadmin', isRoot: true };
const sa1 = { id: 'sa1', role: 'superadmin' };
const sa2 = { id: 'sa2', role: 'superadmin' };
const admin = { id: 'admin', role: 'admin' };
const admin2 = { id: 'admin2', role: 'admin' };
const user = { id: 'user', role: 'user' };
const nobody = { id: 'nobody', role: null };
const everyone = [root, sa1, sa2, admin, admin2, user, nobody];

describe('rank', () => {
	test('rankOfRole', () => {
		expect(rankOfRole('superadmin')).toBe(2);
		expect(rankOfRole('admin')).toBe(1);
		expect(rankOfRole('user')).toBe(0);
		expect(rankOfRole(null)).toBe(0);
		expect(rankOfRole('bogus')).toBe(0);
	});

	test('root outranks superadmins regardless of the role column', () => {
		expect(rank(root)).toBe(3);
		expect(rank({ id: 'x', role: 'user', isRoot: true })).toBe(3);
		expect(rank(sa1)).toBe(2);
		expect(rank(admin)).toBe(1);
		expect(rank(nobody)).toBe(0);
		expect(isRoot(root)).toBe(true);
		expect(isRoot(sa1)).toBe(false);
		expect(isRoot(null)).toBe(false);
	});
});

describe('canViewUser', () => {
	test('same tier or below, plus oneself', () => {
		expect(canViewUser(admin, user)).toBe(true);
		expect(canViewUser(admin, admin2)).toBe(true);
		expect(canViewUser(admin, sa1)).toBe(false);
		expect(canViewUser(admin, root)).toBe(false);
		expect(canViewUser(sa1, root)).toBe(true);
		expect(canViewUser(user, user)).toBe(true);
		expect(canViewUser(user, admin)).toBe(false);
	});
});

describe('canAssignRole', () => {
	test('admins hand out user/admin, never superadmin', () => {
		expect(canAssignRole(admin, 'user')).toBe(true);
		expect(canAssignRole(admin, 'admin')).toBe(true);
		expect(canAssignRole(admin, 'superadmin')).toBe(false);
	});
	test('superadmins and root may hand out superadmin', () => {
		expect(canAssignRole(sa1, 'superadmin')).toBe(true);
		expect(canAssignRole(root, 'superadmin')).toBe(true);
	});
	test('plain users assign nothing', () => {
		expect(canAssignRole(user, 'user')).toBe(false);
		expect(canAssignRole(nobody, 'user')).toBe(false);
	});
});

describe('canManageUser', () => {
	test('peers and below', () => {
		expect(canManageUser(admin, user)).toBe(true);
		expect(canManageUser(admin, admin2)).toBe(true);
		expect(canManageUser(admin, sa1)).toBe(false);
		expect(canManageUser(sa1, sa2)).toBe(true);
		expect(canManageUser(sa1, admin)).toBe(true);
		expect(canManageUser(root, sa1)).toBe(true);
	});
	test('nobody manages root, not even root through this rule', () => {
		for (const a of everyone) expect(canManageUser(a, root), a.id).toBe(false);
	});
	test('plain users manage nobody', () => {
		expect(canManageUser(user, user)).toBe(false);
		expect(canManageUser(user, nobody)).toBe(false);
	});
});

describe('canChangeRole', () => {
	test('own role is immutable at every rank', () => {
		for (const a of everyone) {
			expect(canChangeRole(a, a, 'user'), a.id).toBe(false);
			expect(canChangeRole(a, a, 'superadmin'), a.id).toBe(false);
		}
	});
	test('superadmin may downgrade another superadmin', () => {
		expect(canChangeRole(sa1, sa2, 'admin')).toBe(true);
		expect(canChangeRole(sa1, sa2, 'user')).toBe(true);
	});
	test('admin cannot promote to superadmin or touch a superadmin', () => {
		expect(canChangeRole(admin, user, 'superadmin')).toBe(false);
		expect(canChangeRole(admin, admin2, 'superadmin')).toBe(false);
		expect(canChangeRole(admin, sa1, 'admin')).toBe(false);
		expect(canChangeRole(admin, sa1, 'user')).toBe(false);
	});
	test('admin may move users and other admins within its reach', () => {
		expect(canChangeRole(admin, user, 'admin')).toBe(true);
		expect(canChangeRole(admin, admin2, 'user')).toBe(true);
	});
	test('root may promote to superadmin; nobody changes root', () => {
		expect(canChangeRole(root, user, 'superadmin')).toBe(true);
		expect(canChangeRole(sa1, root, 'admin')).toBe(false);
		expect(canChangeRole(root, root, 'admin')).toBe(false);
	});
});

describe('canImpersonate', () => {
	test('superadmins only', () => {
		expect(canImpersonate(admin, user)).toBe(false);
		expect(canImpersonate(user, user)).toBe(false);
		expect(canImpersonate(sa1, user)).toBe(true);
		expect(canImpersonate(sa1, admin)).toBe(true);
		expect(canImpersonate(sa1, sa2)).toBe(true);
		expect(canImpersonate(root, sa1)).toBe(true);
	});
	test('never root, never oneself, never while impersonating', () => {
		expect(canImpersonate(sa1, root)).toBe(false);
		expect(canImpersonate(root, root)).toBe(false);
		expect(canImpersonate(sa1, sa1)).toBe(false);
		expect(canImpersonate(sa1, user, { actorImpersonating: true })).toBe(false);
	});
});

describe('canManageApiKeyFor', () => {
	test('everyone manages their own keys, root included', () => {
		for (const a of everyone) expect(canManageApiKeyFor(a, a), a.id).toBe(true);
	});
	test('others follow the hierarchy', () => {
		expect(canManageApiKeyFor(admin, user)).toBe(true);
		expect(canManageApiKeyFor(admin, admin2)).toBe(true);
		expect(canManageApiKeyFor(admin, sa1)).toBe(false);
		expect(canManageApiKeyFor(sa1, root)).toBe(false);
		expect(canManageApiKeyFor(user, admin)).toBe(false);
		expect(canManageApiKeyFor(user, nobody)).toBe(false);
	});
});

describe('canManageMcpFor', () => {
	test('self needs an admin-like role; others follow the hierarchy', () => {
		expect(canManageMcpFor(admin, admin)).toBe(true);
		expect(canManageMcpFor(root, root)).toBe(true);
		expect(canManageMcpFor(user, user)).toBe(false);
		expect(canManageMcpFor(admin, user)).toBe(true);
		expect(canManageMcpFor(admin, sa1)).toBe(false);
		expect(canManageMcpFor(sa1, root)).toBe(false);
	});
});

describe('internal-org membership', () => {
	test('org.superadmin is a superadmin grant', () => {
		expect(canSetInternalOrgRole(admin, user, 'org.superadmin')).toBe(false);
		expect(canSetInternalOrgRole(admin, admin, 'org.superadmin')).toBe(false);
		expect(canSetInternalOrgRole(sa1, user, 'org.superadmin')).toBe(true);
		expect(canSetInternalOrgRole(root, admin, 'org.superadmin')).toBe(true);
	});
	test('org.admin / org.staff within reach', () => {
		expect(canSetInternalOrgRole(admin, user, 'org.admin')).toBe(true);
		expect(canSetInternalOrgRole(admin, admin2, 'org.staff')).toBe(true);
		expect(canSetInternalOrgRole(admin, sa1, 'org.staff')).toBe(false);
	});
	test('never oneself, never root', () => {
		expect(canSetInternalOrgRole(sa1, sa1, 'org.staff')).toBe(false);
		expect(canSetInternalOrgRole(sa1, root, 'org.staff')).toBe(false);
		expect(canRemoveInternalOrgMember(sa1, root)).toBe(false);
		expect(canRemoveInternalOrgMember(admin, admin)).toBe(false);
	});
	test('removal is a demotion to user', () => {
		expect(canRemoveInternalOrgMember(admin, admin2)).toBe(true);
		expect(canRemoveInternalOrgMember(admin, sa1)).toBe(false);
		expect(canRemoveInternalOrgMember(sa1, sa2)).toBe(true);
	});
});

describe('assert* wrappers', () => {
	const status = (fn: () => void) => {
		try {
			fn();
		} catch (e) {
			return (e as { status?: number; body?: { message?: string } }) ?? null;
		}
		return null;
	};

	test('throw a kit 403 with the policy message', () => {
		const e = status(() => assertCanChangeRole(admin, sa1, 'user'));
		expect(e?.status).toBe(403);
		expect(e?.body?.message).toBe(POLICY_DENIED_MESSAGE);
	});
	test('name root explicitly', () => {
		const e = status(() => assertCanManageUser(sa1, root));
		expect(e?.status).toBe(403);
		expect(e?.body?.message).toBe(ROOT_UNTOUCHABLE_MESSAGE);
		expect(status(() => assertCanImpersonate(sa1, root))?.status).toBe(403);
		expect(status(() => assertCanManageApiKeyFor(sa1, root))?.status).toBe(403);
	});
	test('pass silently when allowed', () => {
		expect(status(() => assertCanChangeRole(sa1, sa2, 'admin'))).toBeNull();
		expect(status(() => assertCanManageApiKeyFor(user, user))).toBeNull();
	});
});
