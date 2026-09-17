export type StatusId = 'backlog' | 'todo' | 'in_progress' | 'paused' | 'in_review' | 'done';

export type PriorityId = 'none' | 'low' | 'medium' | 'high' | 'urgent';

export type RoleId = 'owner' | 'admin' | 'member' | 'viewer';

export type ProjectId = 'SIWEB' | 'TRACKR' | 'MAJA' | 'WEBIM';

export type TypeId = 'task' | 'bug' | 'improvement' | 'feature' | 'chore';

export interface User {
	id: string;
	name: string;
	initials: string;
	color: string;
	email: string;
	role: RoleId;
	team: string;
	status: 'active' | 'invited' | 'disabled';
	lastSeen: string;
	joinedAt: string;
	mfa: boolean;
	tasks: number;
}

export interface Project {
	name: string;
	color: string;
	description: string;
	status: 'prospect' | 'planned' | 'active' | 'paused' | 'completed' | 'cancelled' | 'archived';
	lead: string;
	members: string[];
	updated: string;
	icon: string;
}

export interface ChecklistItem {
	id: string;
	text: string;
	done: boolean;
}

/**
 * The list shape of a task: everything the rows, cards, filters and sort
 * helpers read, plus small aggregates standing in for the collections the
 * detail carries. This is what the task, week and project pages ship for
 * every visible task; `Task` adds the fields only the inspector needs.
 */
export interface TaskSummary {
	id: string;
	/** Real database UUID (distinct from `id`, which is the display ref). */
	uuid: string;
	title: string;
	status: StatusId;
	priority: PriorityId;
	assignee: string;
	project: ProjectId;
	labels: string[];
	due: string | null;
	updated: string;
	type?: TypeId;
	startDate?: string;
	endDate?: string;
	estimate?: number;
	assignees?: string[];
	tags?: string[];
	createdBy?: string;
	createdAt?: string;
	plannedFor?: string | null;
	inMyPlan?: boolean;
	/** Prerequisites: tasks that should be done before this one starts. */
	dependsOn?: TaskLink[];
	/** Derived: at least one prerequisite is not done. Never stored. */
	blocked?: boolean;
	/** Sum of all time-log entries, in minutes. */
	loggedMinutes: number;
	checklistDone: number;
	checklistTotal: number;
}

export interface Task extends TaskSummary {
	parent?: string | null;
	/** Surface that created the task: web | mcp | api | import | template. */
	channel?: string;
	description?: string;
	checklist?: ChecklistItem[];
	attachments?: { name: string; size: string }[];
	/** Real uploaded attachments (populated from the DB by loadTasks). */
	files?: import('$lib/config/attachments').AttachmentDTO[];
	comments?: {
		id?: string;
		user: string;
		date: string;
		text: string;
		createdAt?: string;
		files?: import('$lib/config/attachments').AttachmentDTO[];
	}[];
	timeLogs?: {
		user: string;
		date: string;
		minutes: number;
		note: string;
		createdAt?: string;
	}[];
	/** Set when the task was spun up from a support ticket. */
	sourceTicket?: { id: string; displayId: string } | null;
	/** Reverse edge: tasks waiting on this one. */
	dependents?: TaskLink[];
}

/** Compact reference to another task, for dependency lists and pickers. */
export interface TaskLink {
	uuid: string;
	/** Display ref, e.g. WEB-12. */
	id: string;
	title: string;
	status: StatusId;
}

export interface WikiPage {
	id: string;
	parent: string | null;
	title: string;
	icon: 'folder' | 'book';
	updated: string;
	author: string;
	body: WikiBlock[];
}

export type WikiBlock =
	| { kind: 'h1' | 'h2' | 'p'; text: string }
	| { kind: 'list'; items: string[] }
	| { kind: 'callout'; tone: 'info' | 'warn'; text: string };

export interface LogEvent {
	id: string;
	type: string;
	actor: string;
	target: string;
	at: string;
	ip: string;
	device: string;
}
