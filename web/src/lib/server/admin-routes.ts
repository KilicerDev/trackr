// The admin area's tier map — ONE place that says which /admin/* subtree
// needs more than `admin.access`. Read by the method-agnostic guard in
// hooks.server.ts (pages and form actions alike), by the section layouts as
// defense in depth, and mirrored in the navigation (sidebar + tabs) through
// the capability manifest. A subtree not listed here is open to every admin.
//
// Adding a superadmin-only page: add its prefix here, and assert the same
// permission in the page's actions (layout loads don't run for POSTs).

import { PERMISSIONS, type Permission } from '$lib/permissions';

// First match wins; `permission: null` re-opens a subtree (legacy redirects).
export const ADMIN_ROUTE_PERMISSIONS: readonly {
	prefix: string;
	permission: Permission | null;
}[] = [
	// Old address of the project templates (now /admin/templates, admin tier):
	// a bare 301 that must keep working for admins too.
	{ prefix: '/admin/settings/templates', permission: null },
	// Instance settings: branding, webhooks, API keys, MCP guidance, devices.
	{ prefix: '/admin/settings', permission: PERMISSIONS.AdminSettingsManage },
	// The job queue and its schedules.
	{ prefix: '/admin/system/jobs', permission: PERMISSIONS.AdminSystemManage },
	{ prefix: '/admin/system/schedules', permission: PERMISSIONS.AdminSystemManage }
];

/** The extra permission a path under /admin needs, or null for admin-tier pages. */
export function adminRoutePermission(pathname: string): Permission | null {
	for (const r of ADMIN_ROUTE_PERMISSIONS) {
		if (pathname === r.prefix || pathname.startsWith(r.prefix + '/')) return r.permission;
	}
	return null;
}

export const SUPERADMIN_REQUIRED_MESSAGE = 'Superadmin access required.';
