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
