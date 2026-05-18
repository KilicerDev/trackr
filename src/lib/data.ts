import type {
	LogEvent,
	Project,
	ProjectId,
	RoleId,
	Task,
	User,
	WikiPage
} from './types';

export const TODAY = '2026-05-12';

export const TRACKR_USERS: User[] = [
	{ id: 'u1', name: 'Maja Schmidt', initials: 'MS', color: '#e0775f', email: 'maja.schmidt@trackr.dev', role: 'admin', team: 'Design', status: 'active', lastSeen: '2 hours ago', joinedAt: '2024-08-14', mfa: true, tasks: 8 },
	{ id: 'u2', name: 'Leon Vogel', initials: 'LV', color: '#7a9cf0', email: 'leon.vogel@trackr.dev', role: 'member', team: 'Engineering', status: 'active', lastSeen: '15 minutes ago', joinedAt: '2024-09-02', mfa: true, tasks: 12 },
	{ id: 'u3', name: 'Ines Krüger', initials: 'IK', color: '#7fc8a9', email: 'ines.krueger@trackr.dev', role: 'member', team: 'Engineering', status: 'active', lastSeen: 'Online now', joinedAt: '2025-01-21', mfa: true, tasks: 5 },
	{ id: 'u4', name: 'Tomás Reyes', initials: 'TR', color: '#c08bd6', email: 'tomas.reyes@trackr.dev', role: 'member', team: 'Operations', status: 'active', lastSeen: 'Yesterday', joinedAt: '2025-02-08', mfa: false, tasks: 3 },
	{ id: 'u5', name: 'Hana Weiss', initials: 'HW', color: '#e9c46a', email: 'hana.weiss@trackr.dev', role: 'member', team: 'Marketing', status: 'active', lastSeen: '4 days ago', joinedAt: '2024-11-19', mfa: true, tasks: 6 },
	{ id: 'u6', name: 'Yusuf Aydın', initials: 'YA', color: '#8fb6c4', email: 'yusuf.aydin@trackr.dev', role: 'owner', team: 'Engineering', status: 'active', lastSeen: 'Online now', joinedAt: '2024-06-01', mfa: true, tasks: 14 },
	{ id: 'u7', name: 'Renée Carter', initials: 'RC', color: '#7a9cf0', email: 'renee.carter@trackr.dev', role: 'viewer', team: 'Operations', status: 'invited', lastSeen: '—', joinedAt: '2026-05-10', mfa: false, tasks: 0 },
	{ id: 'u8', name: 'Pieter Janssen', initials: 'PJ', color: '#ef7a6d', email: 'pieter.janssen@trackr.dev', role: 'member', team: 'Design', status: 'invited', lastSeen: '—', joinedAt: '2026-05-08', mfa: false, tasks: 0 },
	{ id: 'u9', name: 'Old Account', initials: 'OA', color: '#7c7c84', email: 'old.account@trackr.dev', role: 'member', team: 'Engineering', status: 'disabled', lastSeen: '3 months ago', joinedAt: '2023-05-30', mfa: false, tasks: 0 }
];

export const CURRENT_USER_ID = 'u6';
export const currentUser = () => TRACKR_USERS.find((u) => u.id === CURRENT_USER_ID)!;
export const userById = (id: string) => TRACKR_USERS.find((u) => u.id === id);

export const USER_ROLES: { id: RoleId; label: string; color: string; perm: string }[] = [
	{ id: 'owner', label: 'Owner', color: '#ef7a6d', perm: 'Full access · billing · members · settings' },
	{ id: 'admin', label: 'Admin', color: '#c08bd6', perm: 'Members, settings, all projects' },
	{ id: 'member', label: 'Member', color: '#7a9cf0', perm: 'Create & edit in assigned projects' },
	{ id: 'viewer', label: 'Viewer', color: '#7fc8a9', perm: 'Read-only access to shared projects' }
];

export const USER_TEAMS = ['Engineering', 'Design', 'Marketing', 'Operations'];

export const USER_STATUS = {
	active: { label: 'Active', color: '#7fc8a9' },
	invited: { label: 'Invited', color: '#e9c46a' },
	disabled: { label: 'Disabled', color: '#7c7c84' }
} as const;

export const ROLE_PERMISSIONS = [
	{
		group: 'Projects',
		items: [
			{ id: 'project.create', label: 'Create projects', perms: { owner: true, admin: true, member: true, viewer: false } },
			{ id: 'project.edit', label: 'Edit project settings', perms: { owner: true, admin: true, member: false, viewer: false } },
			{ id: 'project.archive', label: 'Archive projects', perms: { owner: true, admin: true, member: true, viewer: false } },
			{ id: 'project.delete', label: 'Delete projects', perms: { owner: true, admin: true, member: false, viewer: false } }
		]
	},
	{
		group: 'Tasks',
		items: [
			{ id: 'task.create', label: 'Create tasks', perms: { owner: true, admin: true, member: true, viewer: false } },
			{ id: 'task.edit_any', label: 'Edit any task', perms: { owner: true, admin: true, member: false, viewer: false } },
			{ id: 'task.edit_own', label: 'Edit own tasks', perms: { owner: true, admin: true, member: true, viewer: false } },
			{ id: 'task.delete_any', label: 'Delete any task', perms: { owner: true, admin: true, member: false, viewer: false } },
			{ id: 'task.comment', label: 'Comment on tasks', perms: { owner: true, admin: true, member: true, viewer: true } },
			{ id: 'task.assign', label: 'Assign tasks to others', perms: { owner: true, admin: true, member: true, viewer: false } }
		]
	},
	{
		group: 'Members',
		items: [
			{ id: 'member.invite', label: 'Invite users', perms: { owner: true, admin: true, member: false, viewer: false } },
			{ id: 'member.roles', label: 'Manage roles', perms: { owner: true, admin: true, member: false, viewer: false } },
			{ id: 'member.disable', label: 'Disable users', perms: { owner: true, admin: false, member: false, viewer: false } }
		]
	},
	{
		group: 'Workspace',
		items: [
			{ id: 'ws.settings', label: 'Edit workspace settings', perms: { owner: true, admin: true, member: false, viewer: false } },
			{ id: 'ws.billing', label: 'Manage billing', perms: { owner: true, admin: false, member: false, viewer: false } },
			{ id: 'ws.integrations', label: 'Connect integrations', perms: { owner: true, admin: true, member: false, viewer: false } },
			{ id: 'ws.audit', label: 'View audit log', perms: { owner: true, admin: true, member: false, viewer: false } }
		]
	}
];

export const TRACKR_PROJECTS: Record<ProjectId, Project> = {
	SIWEB: { name: 'Siweb Marketplace', color: '#e07a5f', description: 'B2B parts marketplace with SKU search, inventory sync, and German localization.', status: 'on_track', lead: 'u2', members: ['u1', 'u2', 'u3', 'u4', 'u5'], updated: '2 hours ago', icon: 'S' },
	TRACKR: { name: 'Trackr Internal', color: '#7a9cf0', description: 'Our own task system — Linear-style workspace for small teams.', status: 'on_track', lead: 'u6', members: ['u2', 'u3', 'u6'], updated: '5 hours ago', icon: 'T' },
	MAJA: { name: 'Maja Demo', color: '#c08bd6', description: 'Demo workspace for the Maja onboarding flow and translation gaps.', status: 'at_risk', lead: 'u1', members: ['u1', 'u4'], updated: 'Yesterday', icon: 'M' },
	WEBIM: { name: 'Webim Campaign', color: '#7fc8a9', description: 'Q2 paid acquisition campaign — landing page, Google ads, copy variants.', status: 'paused', lead: 'u5', members: ['u5', 'u6'], updated: '3 days ago', icon: 'W' }
};

export const PROJECT_STATUS = {
	on_track: { label: 'On track', color: '#7fc8a9' },
	at_risk: { label: 'At risk', color: '#e9c46a' },
	paused: { label: 'Paused', color: '#9aa4b2' },
	off_track: { label: 'Off track', color: '#ef7a6d' }
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

export const TRACKR_LABELS: Record<string, { label: string; color: string }> = {
	web: { label: 'web', color: '#7fc8a9' },
	admin: { label: 'admin', color: '#7a9cf0' },
	bug: { label: 'bug', color: '#ef7a6d' },
	i18n: { label: 'i18n', color: '#c08bd6' },
	ux: { label: 'ux', color: '#e9c46a' },
	copy: { label: 'copy', color: '#8fb6c4' }
};

export const TICKET_STATUSES = [
	{ id: 'open', label: 'Open', dot: '#7a9cf0', tint: 'rgba(122,156,240,0.14)' },
	{ id: 'in_progress', label: 'In Progress', dot: '#f0a85c', tint: 'rgba(240,168,92,0.16)' },
	{ id: 'waiting_on_customer', label: 'Waiting on customer', dot: '#b591e3', tint: 'rgba(181,145,227,0.14)' },
	{ id: 'waiting_on_agent', label: 'Waiting on agent', dot: '#ef7a6d', tint: 'rgba(239,122,109,0.14)' },
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

export const TRACKR_TYPES = [
	{ id: 'task', label: 'Task', color: '#7a9cf0', icon: 'square' },
	{ id: 'bug', label: 'Bug', color: '#ef7a6d', icon: 'bug' },
	{ id: 'improvement', label: 'Improvement', color: '#ef7a6d', icon: 'triangle' },
	{ id: 'feature', label: 'Feature', color: '#7fc8a9', icon: 'sparkle' },
	{ id: 'chore', label: 'Chore', color: '#c08bd6', icon: 'gear' }
] as const;

export const TRACKR_TASKS: Task[] = [
	{
		id: 'SIWEB-15',
		title: 'Gelöschte Artikel besser darstellen',
		status: 'in_progress',
		priority: 'medium',
		assignee: 'u3',
		project: 'SIWEB',
		labels: ['ux'],
		due: null,
		updated: '2026-04-29 15:12',
		type: 'improvement',
		parent: null,
		startDate: '2026-04-21',
		endDate: '2026-05-15',
		estimate: 120,
		assignees: ['u3'],
		tags: [],
		createdBy: 'u3',
		createdAt: '2026-04-21 17:45',
		description: 'Die Darstellung gelöschter Artikel im System soll verbessert werden, damit sie besser erkennbar sind.',
		attachments: [],
		comments: [
			{ user: 'u3', date: '2026-04-29', text: 'Lösung mit Mike abgesprochen: Gelöschte Spare Parts aus der allgemeinen Suche entfernen und nur in seperater Suche im "Deleted" Tab anzeigen' }
		]
	},
	{ id: 'MAJA-13', title: 'German translation not complete', status: 'paused', priority: 'low', assignee: 'u1', project: 'MAJA', labels: ['i18n'], due: null, updated: '2026-05-09', description: 'Missing strings on /pricing, /support and confirmation emails.' },
	{ id: 'SIWEB-27', title: 'Webseite auf Deutsch übersetzen', status: 'paused', priority: 'medium', assignee: 'u1', project: 'SIWEB', labels: ['web', 'i18n'], due: null, updated: '2026-05-08' },
	{ id: 'SIWEB-20', title: 'Condition: 2 Buttons gleichzeitig anklickbar machen', status: 'paused', priority: 'medium', assignee: 'u2', project: 'SIWEB', labels: ['bug'], due: null, updated: '2026-05-06' },
	{ id: 'SIWEB-18', title: 'SKU-Suche reparieren (inkonsistente Trefferanzeige)', status: 'paused', priority: 'low', assignee: 'u2', project: 'SIWEB', labels: ['bug'], due: null, updated: '2026-05-05' },
	{ id: 'SIWEB-16', title: 'Feld für alte & neue Nummern + Discontinued-Feld hinzufügen', status: 'paused', priority: 'medium', assignee: 'u4', project: 'SIWEB', labels: [], due: null, updated: '2026-05-04' },
	{ id: 'SIWEB-8', title: 'Credibility stärken: „Made in Germany" und Expertise kommunizieren', status: 'paused', priority: 'high', assignee: 'u5', project: 'SIWEB', labels: ['web', 'copy'], due: null, updated: '2026-05-02' },
	{ id: 'TRACKR-68', title: 'Plan Current Week Feature', status: 'in_review', priority: 'low', assignee: 'u6', project: 'TRACKR', labels: [], due: null, updated: '2026-05-12' },
	{ id: 'TRACKR-66', title: "Saved Filters doesn't save the Assignee?", status: 'in_review', priority: 'urgent', assignee: 'u2', project: 'TRACKR', labels: ['bug'], due: '2026-05-06', updated: '2026-05-11' },
	{ id: 'WEBIM-3', title: 'Plan erstellen / Angebot Google Bewerbung', status: 'in_review', priority: 'medium', assignee: 'u5', project: 'WEBIM', labels: ['web'], due: '2026-05-14', updated: '2026-05-10' },
	{ id: 'MAJA-16', title: 'Josie Maja Demo Version bereitstellen', status: 'in_review', priority: 'urgent', assignee: 'u1', project: 'MAJA', labels: [], due: null, updated: '2026-05-11' },
	{ id: 'SIWEB-21', title: 'Status-Filter (All / Published / Draft / Deleted) für Artikel und SKUs', status: 'in_review', priority: 'none', assignee: 'u4', project: 'SIWEB', labels: ['admin'], due: null, updated: '2026-05-09' },
	{ id: 'SIWEB-19', title: '"Refurbished (Generalüberholt)" zu "Checked (Geprüft)" umbenennen', status: 'in_review', priority: 'none', assignee: 'u3', project: 'SIWEB', labels: ['copy'], due: null, updated: '2026-05-08' },
	{ id: 'SIWEB-17', title: 'Tetra Pak Nummer immer vorne anzeigen', status: 'in_review', priority: 'none', assignee: 'u2', project: 'SIWEB', labels: [], due: null, updated: '2026-05-07' },
	{ id: 'TRACKR-71', title: 'Add keyboard shortcut palette (⌘K → command list)', status: 'todo', priority: 'medium', assignee: 'u6', project: 'TRACKR', labels: ['ux'], due: '2026-05-19', updated: '2026-05-11' },
	{
		id: 'TRACKR-70',
		title: 'Inline edit task title from list view',
		status: 'todo',
		priority: 'high',
		assignee: 'u2',
		project: 'TRACKR',
		labels: ['ux'],
		due: '2026-05-16',
		updated: '2026-05-10 11:24',
		type: 'feature',
		parent: 'TRACKR-65',
		startDate: '2026-05-10',
		endDate: '2026-05-16',
		estimate: 150,
		assignees: ['u2', 'u6', 'u3'],
		tags: ['ux'],
		createdBy: 'u6',
		createdAt: '2026-05-08 09:12',
		description:
			'Double-click a task title in the list view to edit inline. Esc cancels, Enter or blur saves. Must respect read-only states for archived tasks.',
		attachments: [
			{ name: 'inline-edit-spec.pdf', size: '218 KB' },
			{ name: 'figma-flow.png', size: '1.4 MB' }
		],
		comments: [
			{ user: 'u6', date: '2026-05-09', text: 'Spec attached. Lets get this in before the next release window — should be a quick win for power users.' },
			{ user: 'u3', date: '2026-05-10', text: 'I can take a first pass tomorrow. One question: do we want the edit affordance to show on hover or only on focus?' }
		],
		timeLogs: [
			{ user: 'u3', date: '2026-05-11', minutes: 45, note: 'Sketched out keyboard interactions for cancel/commit.' },
			{ user: 'u2', date: '2026-05-12', minutes: 30, note: 'Wired up double-click and contenteditable scaffold.' }
		]
	},
	{ id: 'SIWEB-31', title: 'Sticky table headers when scrolling long lists', status: 'todo', priority: 'low', assignee: 'u3', project: 'SIWEB', labels: ['web'], due: null, updated: '2026-05-09' },
	{ id: 'WEBIM-7', title: 'Landing page hero copy — A/B variants', status: 'todo', priority: 'medium', assignee: 'u5', project: 'WEBIM', labels: ['copy'], due: '2026-05-20', updated: '2026-05-08' },
	{ id: 'MAJA-22', title: 'Onboarding checklist for new demo accounts', status: 'todo', priority: 'medium', assignee: 'u4', project: 'MAJA', labels: ['ux'], due: '2026-05-22', updated: '2026-05-07' },
	{ id: 'TRACKR-95', title: 'Calendar / timeline view for cross-project planning', status: 'backlog', priority: 'low', assignee: 'u6', project: 'TRACKR', labels: [], due: null, updated: '2026-04-29' },
	{ id: 'TRACKR-93', title: 'Bulk edit selected rows (status, assignee, priority)', status: 'backlog', priority: 'medium', assignee: 'u2', project: 'TRACKR', labels: ['ux'], due: null, updated: '2026-04-27' },
	{ id: 'SIWEB-44', title: 'Export filtered tasks to CSV', status: 'backlog', priority: 'low', assignee: 'u3', project: 'SIWEB', labels: [], due: null, updated: '2026-04-25' }
];

export const WIKI_PAGES: WikiPage[] = [
	{
		id: 'w-home',
		parent: null,
		title: 'Welcome to Trackr',
		icon: 'book',
		updated: '2 hours ago',
		author: 'u6',
		body: [
			{ kind: 'h1', text: 'Welcome to the Trackr workspace' },
			{ kind: 'p', text: 'This is our shared brain. Anything that helps the team move faster — playbooks, decisions, onboarding — belongs here.' },
			{ kind: 'callout', tone: 'info', text: 'Edit any page inline. Slash-commands ( / ) drop in headings, callouts, tables, code blocks.' },
			{ kind: 'h2', text: 'Start here' },
			{ kind: 'list', items: ['New hire? See Engineering → Onboarding.', 'Need a quick way to file a bug? Read How we ship.', 'Looking for policies? Open the People & Ops folder.'] },
			{ kind: 'h2', text: 'Conventions' },
			{ kind: 'p', text: 'Keep page titles short. Link generously. Archive instead of delete.' }
		]
	},
	{ id: 'w-eng', parent: null, title: 'Engineering', icon: 'folder', updated: 'Yesterday', author: 'u2', body: [] },
	{
		id: 'w-onboard',
		parent: 'w-eng',
		title: 'Onboarding',
		icon: 'book',
		updated: '3 days ago',
		author: 'u2',
		body: [
			{ kind: 'h1', text: 'Engineering Onboarding' },
			{ kind: 'p', text: 'Two weeks. End state: you can ship a small feature end-to-end with confidence.' },
			{ kind: 'h2', text: 'Week 1 — get oriented' },
			{ kind: 'list', items: ['Day 1 · Laptop setup, repos, secrets, code of conduct sign-off.', 'Day 2 · Architecture walkthrough with your buddy.', 'Day 3-4 · First PR — pick a "good first issue".', 'Day 5 · Demo what you shipped at the Friday review.'] },
			{ kind: 'h2', text: 'Week 2 — own a slice' },
			{ kind: 'list', items: ['Take on a real task from the current sprint.', 'Pair with someone outside your team for half a day.', 'Write up one thing you learned for the wiki.'] },
			{ kind: 'callout', tone: 'warn', text: 'Stuck? You are encouraged to ask. Avoid burning more than 30 min before reaching out.' }
		]
	},
	{
		id: 'w-ship',
		parent: 'w-eng',
		title: 'How we ship',
		icon: 'book',
		updated: '5 days ago',
		author: 'u6',
		body: [
			{ kind: 'h1', text: 'How we ship' },
			{ kind: 'p', text: 'Small batches, fast feedback, kind code review.' },
			{ kind: 'h2', text: 'The flow' },
			{ kind: 'list', items: ['Pick (or create) a task in Trackr. Status → In Progress.', 'Branch from main. Open the PR early as a draft.', 'Ask for review when CI is green.', 'Squash-merge once approved. Status → Done.'] },
			{ kind: 'h2', text: 'Standards' },
			{ kind: 'list', items: ['PRs under 400 lines whenever possible.', 'Tests for non-trivial logic. Snapshot tests are a smell.', 'No magic constants — name everything.'] }
		]
	},
	{ id: 'w-design', parent: null, title: 'Design', icon: 'folder', updated: '1 week ago', author: 'u1', body: [] },
	{
		id: 'w-tokens',
		parent: 'w-design',
		title: 'Design tokens',
		icon: 'book',
		updated: '1 week ago',
		author: 'u1',
		body: [
			{ kind: 'h1', text: 'Design tokens' },
			{ kind: 'p', text: 'Source of truth for color, type, spacing. If a value needs a new name, propose it here first.' },
			{ kind: 'h2', text: 'Color' },
			{ kind: 'p', text: 'Warm-toned neutrals on top of a coral accent. We avoid pure black; the base is oklch(0.16 0.005 270).' }
		]
	},
	{ id: 'w-people', parent: null, title: 'People & Ops', icon: 'folder', updated: '2 weeks ago', author: 'u4', body: [] },
	{
		id: 'w-pto',
		parent: 'w-people',
		title: 'Time off & holidays',
		icon: 'book',
		updated: '2 weeks ago',
		author: 'u4',
		body: [
			{ kind: 'h1', text: 'Time off & holidays' },
			{ kind: 'p', text: 'Unlimited time off with a minimum: please take at least 4 weeks per year. Block your calendar early so others can plan around you.' },
			{ kind: 'callout', tone: 'info', text: 'Statutory holidays follow your country of residence.' }
		]
	}
];

export const LOG_EVENT_TYPES: Record<
	string,
	{ label: string; icon: string; color: string; kind: string }
> = {
	'user.invite': { label: 'User invited', icon: 'plus', color: '#7a9cf0', kind: 'member' },
	'user.role_change': { label: 'Role changed', icon: 'shield', color: '#c08bd6', kind: 'member' },
	'user.disable': { label: 'User disabled', icon: 'x', color: '#ef7a6d', kind: 'member' },
	'login.success': { label: 'Signed in', icon: 'check', color: '#7fc8a9', kind: 'auth' },
	'login.fail': { label: 'Sign-in failed', icon: 'x', color: '#ef4f5e', kind: 'auth' },
	'project.create': { label: 'Project created', icon: 'folder', color: '#7fc8a9', kind: 'project' },
	'project.archive': { label: 'Project archived', icon: 'folder', color: '#9aa4b2', kind: 'project' },
	'task.delete': { label: 'Task deleted', icon: 'x', color: '#ef7a6d', kind: 'task' },
	'settings.update': { label: 'Settings changed', icon: 'settings', color: '#e9c46a', kind: 'settings' },
	'api.token': { label: 'API token created', icon: 'shield', color: '#7a9cf0', kind: 'settings' }
};

export const LOG_KINDS = [
	{ id: 'all', label: 'All' },
	{ id: 'member', label: 'Members' },
	{ id: 'auth', label: 'Auth' },
	{ id: 'project', label: 'Projects' },
	{ id: 'task', label: 'Tasks' },
	{ id: 'settings', label: 'Settings' }
];

export const LOG_EVENTS: LogEvent[] = [
	{ id: 'e1', type: 'user.invite', actor: 'u6', target: 'pieter.janssen@trackr.dev', at: '2026-05-12 16:42', ip: '85.10.21.4', device: 'Chrome · macOS' },
	{ id: 'e2', type: 'user.role_change', actor: 'u6', target: 'Maja Schmidt → Admin', at: '2026-05-12 14:18', ip: '85.10.21.4', device: 'Chrome · macOS' },
	{ id: 'e3', type: 'login.success', actor: 'u2', target: 'leon.vogel@trackr.dev', at: '2026-05-12 09:02', ip: '94.137.55.18', device: 'Firefox · Linux' },
	{ id: 'e4', type: 'login.fail', actor: '?', target: 'old.account@trackr.dev', at: '2026-05-12 02:14', ip: '203.0.113.7', device: 'Unknown' },
	{ id: 'e5', type: 'project.create', actor: 'u6', target: 'Webim Campaign', at: '2026-05-11 17:30', ip: '85.10.21.4', device: 'Chrome · macOS' },
	{ id: 'e6', type: 'task.delete', actor: 'u2', target: 'SIWEB-44 · Export to CSV', at: '2026-05-11 11:05', ip: '94.137.55.18', device: 'Firefox · Linux' },
	{ id: 'e7', type: 'settings.update', actor: 'u6', target: 'Workspace name → Trackr', at: '2026-05-10 19:50', ip: '85.10.21.4', device: 'Chrome · macOS' },
	{ id: 'e8', type: 'api.token', actor: 'u6', target: 'CI bot · scopes: read', at: '2026-05-10 12:11', ip: '85.10.21.4', device: 'Chrome · macOS' },
	{ id: 'e9', type: 'user.disable', actor: 'u6', target: 'Old Account', at: '2026-05-09 21:00', ip: '85.10.21.4', device: 'Chrome · macOS' },
	{ id: 'e10', type: 'login.success', actor: 'u3', target: 'ines.krueger@trackr.dev', at: '2026-05-09 08:44', ip: '212.45.13.99', device: 'Safari · iOS' },
	{ id: 'e11', type: 'project.archive', actor: 'u4', target: 'Legacy Catalog', at: '2026-05-08 15:28', ip: '94.137.55.18', device: 'Chrome · Windows' },
	{ id: 'e12', type: 'login.fail', actor: '?', target: 'yusuf.aydin@trackr.dev', at: '2026-05-08 03:09', ip: '45.95.168.2', device: 'curl/8' }
];

export function formatDateShort(iso: string | null | undefined): string {
	if (!iso) return '';
	const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (!m) return iso;
	const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	return `${parseInt(m[3])} ${months[parseInt(m[2]) - 1]}`;
}

export function formatDateLong(iso: string | null | undefined): string {
	if (!iso) return '';
	const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (!m) return iso;
	return `${m[3]}.${m[2]}.${m[1]}`;
}

export function formatEstimate(minutes: number | undefined): string {
	if (!minutes) return '—';
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	if (h && m) return `${h}h ${m}m`;
	if (h) return `${h}h`;
	return `${m}m`;
}
