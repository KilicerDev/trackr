// Display metadata for statuses, priorities, types and categories — a copy of
// what src/lib/config/taxonomy.ts declares, kept dependency-free because this
// code is bundled into the widget iframe, not the app.

export type StatusMeta = { label: string; dot: string; tint: string };

export const TICKET_STATUS: Record<string, StatusMeta> = {
	open: { label: 'Open', dot: '#7a9cf0', tint: 'rgba(122,156,240,0.14)' },
	in_progress: { label: 'In progress', dot: '#f0a85c', tint: 'rgba(240,168,92,0.16)' },
	waiting_on_customer: {
		label: 'Waiting on customer',
		dot: '#b591e3',
		tint: 'rgba(181,145,227,0.14)'
	},
	waiting_on_agent: { label: 'Waiting on agent', dot: '#ef7a6d', tint: 'rgba(239,122,109,0.14)' },
	paused: { label: 'Paused', dot: '#e9c46a', tint: 'rgba(233,196,106,0.14)' },
	resolved: { label: 'Resolved', dot: '#7fc8a9', tint: 'rgba(127,200,169,0.16)' },
	closed: { label: 'Closed', dot: '#7c7c84', tint: 'rgba(124,124,132,0.14)' }
};

export const TASK_STATUS: Record<string, StatusMeta> = {
	backlog: { label: 'Backlog', dot: '#7c7c84', tint: 'rgba(124,124,132,0.14)' },
	todo: { label: 'Todo', dot: '#9aa4b2', tint: 'rgba(154,164,178,0.14)' },
	in_progress: { label: 'In progress', dot: '#f0a85c', tint: 'rgba(240,168,92,0.16)' },
	paused: { label: 'Paused', dot: '#e9c46a', tint: 'rgba(233,196,106,0.14)' },
	in_review: { label: 'In review', dot: '#b591e3', tint: 'rgba(181,145,227,0.16)' },
	done: { label: 'Done', dot: '#7fc8a9', tint: 'rgba(127,200,169,0.16)' }
};

export const PROJECT_STATUS: Record<string, StatusMeta> = {
	prospect: { label: 'Prospect', dot: '#9aa4b2', tint: 'rgba(154,164,178,0.14)' },
	planned: { label: 'Planned', dot: '#7a9cf0', tint: 'rgba(122,156,240,0.14)' },
	active: { label: 'Active', dot: '#7fc8a9', tint: 'rgba(127,200,169,0.16)' },
	paused: { label: 'Paused', dot: '#e9c46a', tint: 'rgba(233,196,106,0.14)' },
	completed: { label: 'Completed', dot: '#b591e3', tint: 'rgba(181,145,227,0.16)' },
	cancelled: { label: 'Cancelled', dot: '#ef7a6d', tint: 'rgba(239,122,109,0.14)' },
	archived: { label: 'Archived', dot: '#7c7c84', tint: 'rgba(124,124,132,0.14)' }
};

export const SEARCH_TYPE: Record<string, StatusMeta> = {
	ticket: { label: 'Ticket', dot: '#ef7a6d', tint: 'rgba(239,122,109,0.14)' },
	task: { label: 'Task', dot: '#7a9cf0', tint: 'rgba(122,156,240,0.14)' },
	project: { label: 'Project', dot: '#7fc8a9', tint: 'rgba(127,200,169,0.16)' },
	wiki: { label: 'Wiki', dot: '#c08bd6', tint: 'rgba(192,139,214,0.16)' },
	note: { label: 'Note', dot: '#e9c46a', tint: 'rgba(233,196,106,0.14)' }
};

export const PRIORITY: Record<string, { label: string; bars: number; color: string }> = {
	none: { label: 'None', bars: 0, color: '#5b5b62' },
	low: { label: 'Low', bars: 1, color: '#7a9cf0' },
	medium: { label: 'Medium', bars: 2, color: '#f0a85c' },
	high: { label: 'High', bars: 3, color: '#ef7a6d' },
	urgent: { label: 'Urgent', bars: 4, color: '#ef4f5e' }
};

export const TASK_TYPE: Record<string, { label: string; color: string }> = {
	task: { label: 'Task', color: '#7a9cf0' },
	bug: { label: 'Bug', color: '#ef7a6d' },
	improvement: { label: 'Improvement', color: '#ef7a6d' },
	feature: { label: 'Feature', color: '#7fc8a9' },
	chore: { label: 'Chore', color: '#c08bd6' }
};

export const TICKET_CATEGORY: Record<string, { label: string; color: string }> = {
	general: { label: 'General', color: '#9aa4b2' },
	billing: { label: 'Billing', color: '#e9c46a' },
	technical_issue: { label: 'Technical issue', color: '#ef7a6d' },
	feature_request: { label: 'Feature request', color: '#7fc8a9' }
};

export const FALLBACK_STATUS: StatusMeta = {
	label: '',
	dot: '#7c7c84',
	tint: 'rgba(124,124,132,0.14)'
};

export function statusMeta(map: Record<string, StatusMeta>, id: string): StatusMeta {
	return map[id] ?? { ...FALLBACK_STATUS, label: id.replace(/_/g, ' ') };
}
