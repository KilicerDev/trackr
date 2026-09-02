// Static taxonomy / option lists for the workspace: the statuses, priorities,
// types, categories, and channels the UI renders into dropdowns, badges, and
// filters. These are app config — not seed data — and define the fixed set of
// enum values the app understands.

export const PROJECT_STATUS = {
	prospect: { label: 'Prospect', color: '#c08bd6' },
	planned: { label: 'Planned', color: '#7a9cf0' },
	active: { label: 'Active', color: '#7fc8a9' },
	paused: { label: 'Paused', color: '#9aa4b2' },
	completed: { label: 'Completed', color: '#7c9b86' },
	cancelled: { label: 'Cancelled', color: '#ef7a6d' },
	archived: { label: 'Archived', color: '#9aa4b2' }
} as const;

export const TRACKR_STATUSES = [
	{ id: 'backlog', label: 'Backlog', dot: '#7c7c84', tint: 'rgba(124,124,132,0.14)' },
	{ id: 'todo', label: 'Todo', dot: '#9aa4b2', tint: 'rgba(154,164,178,0.14)' },
	{ id: 'in_progress', label: 'In Progress', dot: '#f0a85c', tint: 'rgba(240,168,92,0.16)' },
	{ id: 'paused', label: 'Paused', dot: '#e9c46a', tint: 'rgba(233,196,106,0.14)' },
	{ id: 'in_review', label: 'In Review', dot: '#b591e3', tint: 'rgba(181,145,227,0.16)' },
	{ id: 'done', label: 'Done', dot: '#7fc8a9', tint: 'rgba(127,200,169,0.16)' }
] as const;

export const TRACKR_PRIORITIES = [
	{ id: 'none', label: 'None', bars: 0, color: '#5b5b62' },
	{ id: 'low', label: 'Low', bars: 1, color: '#7a9cf0' },
	{ id: 'medium', label: 'Medium', bars: 2, color: '#f0a85c' },
	{ id: 'high', label: 'High', bars: 3, color: '#ef7a6d' },
	{ id: 'urgent', label: 'Urgent', bars: 4, color: '#ef4f5e' }
] as const;

export const TRACKR_TYPES = [
	{ id: 'task', label: 'Task', color: '#7a9cf0', icon: 'square' },
	{ id: 'bug', label: 'Bug', color: '#ef7a6d', icon: 'bug' },
	{ id: 'improvement', label: 'Improvement', color: '#ef7a6d', icon: 'triangle' },
	{ id: 'feature', label: 'Feature', color: '#7fc8a9', icon: 'sparkle' },
	{ id: 'chore', label: 'Chore', color: '#c08bd6', icon: 'gear' }
] as const;

export const TICKET_STATUSES = [
	{ id: 'open', label: 'Open', dot: '#7a9cf0', tint: 'rgba(122,156,240,0.14)' },
	{ id: 'in_progress', label: 'In Progress', dot: '#f0a85c', tint: 'rgba(240,168,92,0.16)' },
	{
		id: 'waiting_on_customer',
		label: 'Waiting on customer',
		dot: '#b591e3',
		tint: 'rgba(181,145,227,0.14)'
	},
	{
		id: 'waiting_on_agent',
		label: 'Waiting on agent',
		dot: '#ef7a6d',
		tint: 'rgba(239,122,109,0.14)'
	},
	{ id: 'paused', label: 'Paused', dot: '#e9c46a', tint: 'rgba(233,196,106,0.14)' },
	{ id: 'resolved', label: 'Resolved', dot: '#7fc8a9', tint: 'rgba(127,200,169,0.16)' },
	{ id: 'closed', label: 'Closed', dot: '#7c7c84', tint: 'rgba(124,124,132,0.14)' }
] as const;

export const TICKET_CATEGORIES = [
	{ id: 'general', label: 'General', color: '#9aa4b2' },
	{ id: 'billing', label: 'Billing', color: '#e9c46a' },
	{ id: 'technical_issue', label: 'Technical issue', color: '#ef7a6d' },
	{ id: 'feature_request', label: 'Feature request', color: '#7fc8a9' }
] as const;

export const TICKET_CHANNELS = [
	{ id: 'web_form', label: 'Web form' },
	{ id: 'email', label: 'Email' },
	{ id: 'chat', label: 'Chat' },
	{ id: 'api', label: 'API' }
] as const;

// Tickets reuse TRACKR_PRIORITIES minus 'none' — every ticket has a priority.
export const TICKET_PRIORITIES = TRACKR_PRIORITIES.filter((p) => p.id !== 'none');

export const ROLE_PERMISSIONS = [
	{
		group: 'Projects',
		items: [
			{
				id: 'project.create',
				label: 'Create projects',
				perms: { owner: true, admin: true, member: true, viewer: false }
			},
			{
				id: 'project.edit',
				label: 'Edit project settings',
				perms: { owner: true, admin: true, member: false, viewer: false }
			},
			{
				id: 'project.archive',
				label: 'Archive projects',
				perms: { owner: true, admin: true, member: true, viewer: false }
			},
			{
				id: 'project.delete',
				label: 'Delete projects',
				perms: { owner: true, admin: true, member: false, viewer: false }
			}
		]
	},
	{
		group: 'Tasks',
		items: [
			{
				id: 'task.create',
				label: 'Create tasks',
				perms: { owner: true, admin: true, member: true, viewer: false }
			},
			{
				id: 'task.edit_any',
				label: 'Edit any task',
				perms: { owner: true, admin: true, member: false, viewer: false }
			},
			{
				id: 'task.edit_own',
				label: 'Edit own tasks',
				perms: { owner: true, admin: true, member: true, viewer: false }
			},
			{
				id: 'task.delete_any',
				label: 'Delete any task',
				perms: { owner: true, admin: true, member: false, viewer: false }
			},
			{
				id: 'task.comment',
				label: 'Comment on tasks',
				perms: { owner: true, admin: true, member: true, viewer: true }
			},
			{
				id: 'task.assign',
				label: 'Assign tasks to others',
				perms: { owner: true, admin: true, member: true, viewer: false }
			}
		]
	},
	{
		group: 'Members',
		items: [
			{
				id: 'member.invite',
				label: 'Invite users',
				perms: { owner: true, admin: true, member: false, viewer: false }
			},
			{
				id: 'member.roles',
				label: 'Manage roles',
				perms: { owner: true, admin: true, member: false, viewer: false }
			},
			{
				id: 'member.disable',
				label: 'Disable users',
				perms: { owner: true, admin: false, member: false, viewer: false }
			}
		]
	},
	{
		group: 'Workspace',
		items: [
			{
				id: 'ws.settings',
				label: 'Edit workspace settings',
				perms: { owner: true, admin: true, member: false, viewer: false }
			},
			{
				id: 'ws.billing',
				label: 'Manage billing',
				perms: { owner: true, admin: false, member: false, viewer: false }
			},
			{
				id: 'ws.integrations',
				label: 'Connect integrations',
				perms: { owner: true, admin: true, member: false, viewer: false }
			},
			{
				id: 'ws.audit',
				label: 'View audit log',
				perms: { owner: true, admin: true, member: false, viewer: false }
			}
		]
	}
];

export const LOG_EVENT_TYPES: Record<
	string,
	{ label: string; icon: string; color: string; kind: string }
> = {
	// auth
	'login.success': { label: 'Signed in', icon: 'check', color: '#7fc8a9', kind: 'auth' },
	'login.fail': { label: 'Sign-in failed', icon: 'x', color: '#ef4f5e', kind: 'auth' },
	'user.password_reset': {
		label: 'Password reset sent',
		icon: 'refresh',
		color: '#e9c46a',
		kind: 'auth'
	},
	// members
	'user.create': { label: 'User created', icon: 'plus', color: '#7fc8a9', kind: 'member' },
	'user.invite': { label: 'User invited', icon: 'plus', color: '#7a9cf0', kind: 'member' },
	'user.invite_revoke': { label: 'Invite revoked', icon: 'x', color: '#9aa4b2', kind: 'member' },
	'user.role_change': { label: 'Role changed', icon: 'shield', color: '#c08bd6', kind: 'member' },
	'user.disable': { label: 'User disabled', icon: 'x', color: '#ef7a6d', kind: 'member' },
	'user.delete': { label: 'User deleted', icon: 'trash', color: '#ef4f5e', kind: 'member' },
	'user.impersonate': {
		label: 'Impersonation started',
		icon: 'users',
		color: '#c08bd6',
		kind: 'member'
	},
	// projects
	'project.create': { label: 'Project created', icon: 'folder', color: '#7fc8a9', kind: 'project' },
	'project_template.create': {
		label: 'Template created',
		icon: 'list',
		color: '#7fc8a9',
		kind: 'settings'
	},
	'project_template.publish': {
		label: 'Template published',
		icon: 'check',
		color: '#7fc8a9',
		kind: 'settings'
	},
	'project_template.unpublish': {
		label: 'Template moved to draft',
		icon: 'pencil',
		color: '#e9c46a',
		kind: 'settings'
	},
	'project_template.delete': {
		label: 'Template deleted',
		icon: 'trash',
		color: '#ef4f5e',
		kind: 'settings'
	},
	'project.update': {
		label: 'Project updated',
		icon: 'settings',
		color: '#7a9cf0',
		kind: 'project'
	},
	'project.archive': {
		label: 'Project archived',
		icon: 'folder',
		color: '#9aa4b2',
		kind: 'project'
	},
	'project.delete': { label: 'Project deleted', icon: 'trash', color: '#ef4f5e', kind: 'project' },
	'project.member': {
		label: 'Project membership changed',
		icon: 'users',
		color: '#7a9cf0',
		kind: 'project'
	},
	// tasks
	'task.create': { label: 'Task created', icon: 'plus', color: '#7fc8a9', kind: 'task' },
	'task.import': { label: 'Tasks imported', icon: 'download', color: '#7fc8a9', kind: 'task' },
	'task.status': {
		label: 'Task status changed',
		icon: 'check-square',
		color: '#7a9cf0',
		kind: 'task'
	},
	'task.comment': { label: 'Task comment', icon: 'msg', color: '#9aa4b2', kind: 'task' },
	'task.delete': { label: 'Task deleted', icon: 'x', color: '#ef7a6d', kind: 'task' },
	// tickets
	'ticket.create': { label: 'Ticket created', icon: 'ticket', color: '#7fc8a9', kind: 'ticket' },
	'ticket.update': {
		label: 'Ticket status changed',
		icon: 'ticket',
		color: '#7a9cf0',
		kind: 'ticket'
	},
	'ticket.priority': {
		label: 'Ticket priority changed',
		icon: 'ticket',
		color: '#7a9cf0',
		kind: 'ticket'
	},
	'ticket.category': {
		label: 'Ticket category changed',
		icon: 'ticket',
		color: '#7a9cf0',
		kind: 'ticket'
	},
	'ticket.assign': {
		label: 'Ticket assignment changed',
		icon: 'user',
		color: '#7a9cf0',
		kind: 'ticket'
	},
	'ticket.edit': { label: 'Ticket edited', icon: 'ticket', color: '#9aa4b2', kind: 'ticket' },
	'ticket.message': { label: 'Ticket reply', icon: 'msg', color: '#7fc8a9', kind: 'ticket' },
	'ticket.delete': { label: 'Ticket deleted', icon: 'trash', color: '#ef7a6d', kind: 'ticket' },
	'ticket.convert': {
		label: 'Ticket converted to task',
		icon: 'arrow-up',
		color: '#7a9cf0',
		kind: 'ticket'
	},
	// settings
	'settings.update': {
		label: 'Settings changed',
		icon: 'settings',
		color: '#e9c46a',
		kind: 'settings'
	},
	'api.token': { label: 'API token created', icon: 'shield', color: '#7a9cf0', kind: 'settings' },
	// webhooks
	'webhook.create': { label: 'Webhook created', icon: 'plus', color: '#7fc8a9', kind: 'settings' },
	'webhook.update': {
		label: 'Webhook updated',
		icon: 'pencil',
		color: '#7a9cf0',
		kind: 'settings'
	},
	'webhook.delete': { label: 'Webhook deleted', icon: 'trash', color: '#ef4f5e', kind: 'settings' },
	'webhook.rotate_secret': {
		label: 'Webhook secret rotated',
		icon: 'refresh',
		color: '#e9c46a',
		kind: 'settings'
	},
	'webhook.enable': { label: 'Webhook enabled', icon: 'check', color: '#7fc8a9', kind: 'settings' },
	'webhook.disable': { label: 'Webhook disabled', icon: 'x', color: '#e9c46a', kind: 'settings' }
};

export const LOG_KINDS = [
	{ id: 'all', label: 'All' },
	{ id: 'member', label: 'Members' },
	{ id: 'auth', label: 'Auth' },
	{ id: 'project', label: 'Projects' },
	{ id: 'task', label: 'Tasks' },
	{ id: 'ticket', label: 'Tickets' },
	{ id: 'settings', label: 'Settings' }
];
