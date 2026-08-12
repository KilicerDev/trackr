// Permission and role identifiers used across server and client.
// These mirror the matrix seeded by drizzle/0008_roles_foundation.sql.
// Adding a new permission means: add it here, add it to the matrix in the
// migration (or a follow-up migration), then use it in `can()` checks.

export type Scope = 'org' | 'project';

export const ROLE_IDS = {
	// Internal (Trackr) org only
	OrgSuperadmin: 'org.superadmin',
	OrgAdmin: 'org.admin',
	OrgStaff: 'org.staff',
	// Any org
	OrgClient: 'org.client',
	OrgAgent: 'org.agent',
	OrgMember: 'org.member',
	// Projects
	ProjectManager: 'project.manager',
	ProjectMember: 'project.member',
	ProjectViewer: 'project.viewer'
} as const;

export type RoleId = (typeof ROLE_IDS)[keyof typeof ROLE_IDS];

// Permissions are flat strings. Grouped here only for readability.
export const PERMISSIONS = {
	// Admin surface — only Trackr org admin/superadmin grant these.
	AdminAccess: 'admin.access',
	AdminUsersManage: 'admin.users.manage',
	AdminRolesManage: 'admin.roles.manage',
	AdminOrgsManage: 'admin.orgs.manage',
	AdminSettingsManage: 'admin.settings.manage',
	AdminLogsView: 'admin.logs.view',
	// Org-scoped (tickets, org members)
	OrgTicketsCreate: 'org.tickets.create',
	OrgTicketsReadOwn: 'org.tickets.read.own',
	OrgTicketsReadAny: 'org.tickets.read.any',
	OrgTicketsEditOwn: 'org.tickets.edit.own',
	OrgTicketsEditAny: 'org.tickets.edit.any',
	OrgTicketsDeleteAny: 'org.tickets.delete.any',
	OrgTicketsComment: 'org.tickets.comment',
	OrgChatRead: 'org.chat.read',
	OrgChatPost: 'org.chat.post',
	OrgMembersManage: 'org.members.manage',
	// Project-scoped (tasks, project settings)
	ProjectCreate: 'project.create',
	ProjectTasksCreate: 'project.tasks.create',
	ProjectTasksRead: 'project.tasks.read',
	ProjectTasksEditOwn: 'project.tasks.edit.own',
	ProjectTasksEditAny: 'project.tasks.edit.any',
	ProjectTasksDeleteAny: 'project.tasks.delete.any',
	ProjectTasksComment: 'project.tasks.comment',
	ProjectTasksAssign: 'project.tasks.assign',
	ProjectEdit: 'project.edit',
	ProjectArchive: 'project.archive',
	ProjectMembersManage: 'project.members.manage'
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// Shape of the memberships blob attached to event.locals on every request.
export type Memberships = {
	orgs: { orgId: string; role: RoleId; isInternal: boolean }[];
	projects: { projectId: string; role: RoleId }[];
};

// The server-computed answer to "what can this user see and do" — built once
// per request by $lib/server/capabilities.ts and shipped to the web client
// (layout data) and the mobile app (/api/v1/me). It replaces the scattered
// client-side re-derivations (sidebar gating, settings access map, string-
// prefix checks). These are authorization *hints* for UI gating: the server
// always re-checks writes with scope-specific can().
export type CapabilityManifest = {
	// staff = member of the internal Trackr org; external = everyone else.
	// Display concern only — feature access comes from `surfaces`.
	userType: 'staff' | 'external';
	isAdmin: boolean;
	// Which top-level surfaces this user can reach at all. Drives navigation
	// on web and mobile; a surface that is false has no reachable routes.
	surfaces: {
		tickets: boolean;
		chat: boolean;
		tasks: boolean;
		projects: boolean;
		wiki: boolean;
		notes: boolean;
		admin: boolean;
	};
	// Which entity types the quick-create affordances may offer.
	quickCreate: { ticket: boolean; task: boolean; note: boolean };
	// Union of every permission held anywhere (= effectivePermissions).
	// Imprecise by design — "can do X somewhere". Use the per-target maps
	// below when the target is known.
	global: Permission[];
	// Target-aware permission sets so clients can gate correctly per org /
	// per project (and offline, in the mobile app). Note: project entries do
	// not include the server's org-role fallback; when in doubt the server's
	// can() is authoritative.
	orgs: Record<string, { role: RoleId; isInternal: boolean; permissions: Permission[] }>;
	projects: Record<string, { role: RoleId; permissions: Permission[] }>;
};
