export type Role = 'user' | 'admin' | 'superadmin';

export const ROLE_META: Record<Role, { label: string; color: string; perm: string }> = {
	user: {
		label: 'User',
		color: '#7a9cf0',
		perm: 'Workspace member — read/write on assigned tasks and projects.'
	},
	admin: {
		label: 'Admin',
		color: '#c08bd6',
		perm: 'Manage workspace members and settings.'
	},
	superadmin: {
		label: 'Superadmin',
		color: '#ef7a6d',
		perm: 'Root tier — full access including superadmin management and impersonation.'
	}
};

// Metadata for the org-scoped roles stored on `organization_member.role`.
// Mirrors the seeded `role` table (drizzle/0008). Keyed by org role id.
export const ORG_ROLE_META: Record<string, { label: string; color: string; perm: string }> = {
	'org.superadmin': {
		label: 'Superadmin',
		color: '#ef7a6d',
		perm: 'Full access across the entire workspace, including role management.'
	},
	'org.admin': {
		label: 'Admin',
		color: '#c08bd6',
		perm: 'Full operational access. Manages users, orgs, settings, and all projects.'
	},
	'org.staff': {
		label: 'Staff',
		color: '#7a9cf0',
		perm: 'Internal team member. Cross-org ticket visibility; works on assigned projects.'
	},
	'org.client': {
		label: 'Client',
		color: '#7fc8a9',
		perm: "External org member with full visibility over their org's tickets."
	},
	'org.member': {
		label: 'Member',
		color: '#8fb6c4',
		perm: 'External org member. Can create and manage only their own tickets.'
	}
};
