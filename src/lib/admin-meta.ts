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
