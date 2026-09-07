import { describe, expect, test } from 'bun:test';
import {
	allowedOrgRoles,
	canAssignRole,
	canManageTarget,
	CLIENT_ORG_ROLES,
	deriveUserRole,
	INTERNAL_ORG_ROLES,
	isAdminLike,
	isAllowedOrgRole,
	isPortalSeeAllRole,
	isSuperadmin
} from './roles';

describe('app roles', () => {
	test('isAdminLike / isSuperadmin', () => {
		expect(isAdminLike('admin')).toBe(true);
		expect(isAdminLike('superadmin')).toBe(true);
		expect(isAdminLike('user')).toBe(false);
		expect(isAdminLike(null)).toBe(false);
		expect(isSuperadmin('superadmin')).toBe(true);
		expect(isSuperadmin('admin')).toBe(false);
	});

	test('only a superadmin may touch a superadmin', () => {
		expect(canManageTarget('admin', 'superadmin')).toBe(false);
		expect(canManageTarget('superadmin', 'superadmin')).toBe(true);
		expect(canManageTarget('user', 'admin')).toBe(true);
		expect(canManageTarget(undefined, null)).toBe(true);
	});

	test('role assignment needs an admin-like caller; superadmin needs superadmin', () => {
		expect(canAssignRole('admin', 'admin')).toBe(true);
		expect(canAssignRole('admin', 'user')).toBe(true);
		expect(canAssignRole('admin', 'superadmin')).toBe(false);
		expect(canAssignRole('superadmin', 'superadmin')).toBe(true);
		expect(canAssignRole('user', 'user')).toBe(false);
	});
});

describe('org roles', () => {
	test('internal vs client role sets are disjoint', () => {
		for (const r of INTERNAL_ORG_ROLES) expect(CLIENT_ORG_ROLES).not.toContain(r);
	});

	test('allowedOrgRoles / isAllowedOrgRole follow the org kind', () => {
		expect(allowedOrgRoles(true)).toEqual(INTERNAL_ORG_ROLES);
		expect(allowedOrgRoles(false)).toEqual(CLIENT_ORG_ROLES);
		expect(isAllowedOrgRole('org.staff', true)).toBe(true);
		expect(isAllowedOrgRole('org.staff', false)).toBe(false);
		expect(isAllowedOrgRole('org.client', false)).toBe(true);
		expect(isAllowedOrgRole('org.client', true)).toBe(false);
		expect(isAllowedOrgRole('bogus', true)).toBe(false);
	});

	test('portal see-all tier is client + agent only', () => {
		expect(isPortalSeeAllRole('org.client')).toBe(true);
		expect(isPortalSeeAllRole('org.agent')).toBe(true);
		expect(isPortalSeeAllRole('org.member')).toBe(false);
		expect(isPortalSeeAllRole('org.admin')).toBe(false);
		expect(isPortalSeeAllRole(null)).toBe(false);
	});

	test('deriveUserRole only elevates through the internal org', () => {
		expect(deriveUserRole('org.superadmin', true)).toBe('superadmin');
		expect(deriveUserRole('org.admin', true)).toBe('admin');
		expect(deriveUserRole('org.staff', true)).toBe('user');
		expect(deriveUserRole('org.admin', false)).toBe('user');
		expect(deriveUserRole('org.superadmin', false)).toBe('user');
	});
});
