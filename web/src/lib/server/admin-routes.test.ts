import { describe, expect, test } from 'bun:test';
import { adminRoutePermission } from './admin-routes';

describe('adminRoutePermission', () => {
	test('admin-tier pages need nothing extra', () => {
		for (const p of [
			'/admin',
			'/admin/directory/users',
			'/admin/directory/organizations/x',
			'/admin/templates',
			'/admin/templates/abc',
			'/admin/system',
			'/admin/system/logs',
			'/admin/system/logs/export',
			'/admin/system/roles'
		]) {
			expect(adminRoutePermission(p), p).toBeNull();
		}
	});

	test('the settings section is superadmin tier', () => {
		for (const p of [
			'/admin/settings',
			'/admin/settings/webhooks/abc',
			'/admin/settings/api-keys',
			'/admin/settings/mcp/guides/new',
			'/admin/settings/devices',
			'/admin/settings/mcp'
		]) {
			expect(adminRoutePermission(p), p).toBe('admin.settings.manage');
		}
	});

	test('the job queue and schedules are superadmin tier', () => {
		expect(adminRoutePermission('/admin/system/jobs')).toBe('admin.system.manage');
		expect(adminRoutePermission('/admin/system/schedules')).toBe('admin.system.manage');
	});

	test('the legacy templates address stays open to admins (301 to /admin/templates)', () => {
		expect(adminRoutePermission('/admin/settings/templates')).toBeNull();
		expect(adminRoutePermission('/admin/settings/templates/abc')).toBeNull();
	});

	test('prefix matching is segment-aware', () => {
		expect(adminRoutePermission('/admin/settingsx')).toBeNull();
		expect(adminRoutePermission('/admin/system/jobsy')).toBeNull();
	});
});
