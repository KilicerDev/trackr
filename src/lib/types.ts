export type StatusId =
	| 'backlog'
	| 'todo'
	| 'in_progress'
	| 'paused'
	| 'in_review'
	| 'done';

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

export interface Task {
	id: string;
	/** Real database UUID (distinct from `id`, which is the display ref). */
	uuid?: string;
	title: string;
	status: StatusId;
	priority: PriorityId;
	assignee: string;
	project: ProjectId;
	labels: string[];
	due: string | null;
	updated: string;
	type?: TypeId;
	parent?: string | null;
	startDate?: string;
	endDate?: string;
	estimate?: number;
	assignees?: string[];
	tags?: string[];
	createdBy?: string;
	createdAt?: string;
	description?: string;
	attachments?: { name: string; size: string }[];
	/** Real uploaded attachments (populated from the DB by loadTasks). */
	files?: import('$lib/attachments/config').AttachmentDTO[];
	comments?: {
		id?: string;
		user: string;
		date: string;
		text: string;
		createdAt?: string;
		files?: import('$lib/attachments/config').AttachmentDTO[];
	}[];
	timeLogs?: {
		user: string;
		date: string;
		minutes: number;
		note: string;
		createdAt?: string;
	}[];
	plannedFor?: string | null;
	inMyPlan?: boolean;
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
