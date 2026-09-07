// Compact markdown renderers for MCP tool results.
//
// Rules: dates are ISO 8601 (UTC), identifiers are the human display ids
// (TRACK-108, WEB-12, project/org keys, uuids for wiki/notes/attachments),
// bodies are markdown (tickets/tasks store markdown; wiki/notes are converted
// by the caller before they reach here). Never dump raw HTML.

import type { TicketMessageRow, TicketRow } from '$lib/server/tickets';
import type { Task } from '$lib/types';
import { formatBytes, type AttachmentDTO } from '$lib/config/attachments';

/** id → display name; built from `loadTicketDisplayUsers` rows. */
export type UserDirectory = Map<string, string>;

export function iso(v: string | Date | null | undefined): string | null {
	if (v == null) return null;
	if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
	const d = new Date(v);
	return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** YYYY-MM-DD, or the raw string when it already is a date-only value. */
export function day(v: string | Date | null | undefined): string | null {
	if (v == null || v === '') return null;
	if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
	const s = iso(v);
	return s ? s.slice(0, 10) : null;
}

export function userName(dir: UserDirectory, id: string | null | undefined): string {
	if (!id) return '—';
	return dir.get(id) ?? id;
}

export function userNames(dir: UserDirectory, ids: readonly string[] | undefined): string {
	if (!ids || ids.length === 0) return '—';
	return ids.map((id) => userName(dir, id)).join(', ');
}

export function truncate(s: string, max: number): string {
	if (s.length <= max) return s;
	return `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function attachmentDownloadUrl(origin: string, id: string): string {
	return `${origin}/api/attachments/${id}/download`;
}

export function attachmentsMd(list: readonly AttachmentDTO[], origin: string): string {
	if (list.length === 0) return '_none_';
	return list
		.map((a) => {
			const dims = a.width && a.height ? `, ${a.width}×${a.height}` : '';
			return `- ${a.filename} (${a.mimeType}, ${formatBytes(a.sizeBytes)}${dims}) — id \`${a.id}\` — ${attachmentDownloadUrl(origin, a.id)}`;
		})
		.join('\n');
}

export type ChecklistItemLike = { id: string; text: string; done: boolean };

export function checklistMd(items: readonly ChecklistItemLike[]): string {
	if (items.length === 0) return '_none_';
	return items.map((it) => `- [${it.done ? 'x' : ' '}] ${it.text} — id \`${it.id}\``).join('\n');
}

export function checklistSummary(items: readonly ChecklistItemLike[]): string {
	const done = items.filter((i) => i.done).length;
	return `${done}/${items.length}`;
}

export function listMd(title: string, lines: readonly string[], total: number): string {
	const head =
		lines.length === total
			? `## ${title} (${total})`
			: `## ${title} (showing ${lines.length} of ${total})`;
	if (lines.length === 0) return `${head}\n\n_none_`;
	return `${head}\n\n${lines.join('\n')}`;
}

// ─── Tickets ────────────────────────────────────────────────────────────────

export function ticketLine(t: TicketRow, dir: UserDirectory): string {
	const bits = [
		`**${t.displayId}** ${truncate(t.subject, 90)}`,
		t.status,
		t.priority,
		`assignees: ${userNames(dir, t.assignees)}`,
		`updated ${iso(t.lastMessageAt ?? t.updatedAt)}`
	];
	return `- ${bits.join(' · ')}`;
}

export type TicketRowSummary = {
	key: string;
	subject: string;
	status: string;
	priority: string;
	category: string;
	orgKey: string;
	orgName: string;
	assignees: { id: string; name: string }[];
	customer: { id: string; name: string } | null;
	messageCount: number;
	lastActivityAt: string | null;
	updatedAt: string;
	createdAt: string;
};

export function ticketSummary(t: TicketRow, dir: UserDirectory): TicketRowSummary {
	return {
		key: t.displayId,
		subject: t.subject,
		status: t.status,
		priority: t.priority,
		category: t.category,
		orgKey: t.displayId.slice(0, t.displayId.lastIndexOf('-')),
		orgName: t.orgName,
		assignees: t.assignees.map((id) => ({ id, name: userName(dir, id) })),
		customer: t.customerId ? { id: t.customerId, name: userName(dir, t.customerId) } : null,
		messageCount: t.messageCount,
		lastActivityAt: iso(t.lastMessageAt ?? t.updatedAt),
		updatedAt: t.updatedAt,
		createdAt: t.createdAt
	};
}

type SystemEventMeta = Record<string, unknown> | null;

function systemEventText(meta: SystemEventMeta, body: string, dir: UserDirectory): string {
	const ev = meta && typeof meta.event === 'string' ? meta.event : null;
	switch (ev) {
		case 'status_changed':
			return `status: ${String(meta!.from)} → ${String(meta!.to)}`;
		case 'priority_changed':
			return `priority: ${String(meta!.from)} → ${String(meta!.to)}`;
		case 'category_changed':
			return `category: ${String(meta!.from)} → ${String(meta!.to)}`;
		case 'assigned': {
			const added = Array.isArray(meta!.added) ? (meta!.added as string[]) : [];
			const removed = Array.isArray(meta!.removed) ? (meta!.removed as string[]) : [];
			const parts: string[] = [];
			if (added.length) parts.push(`assigned ${userNames(dir, added)}`);
			if (removed.length) parts.push(`unassigned ${userNames(dir, removed)}`);
			return parts.join('; ') || 'assignees changed';
		}
		case 'edited': {
			const parts: string[] = [];
			const subject = meta!.subject as { from: string; to: string } | undefined;
			const tags = meta!.tags as { from: string[]; to: string[] } | undefined;
			if (subject) parts.push(`subject: "${subject.from}" → "${subject.to}"`);
			if (tags) parts.push(`tags: [${tags.from.join(', ')}] → [${tags.to.join(', ')}]`);
			return parts.join('; ') || 'ticket edited';
		}
		default:
			return body;
	}
}

export type TicketMessageWithFiles = TicketMessageRow & { attachments: AttachmentDTO[] };

export function ticketDetailMd(input: {
	ticket: TicketRow;
	messages: readonly TicketMessageWithFiles[];
	attachments: readonly AttachmentDTO[];
	users: UserDirectory;
	linkedTasks: readonly { displayId: string; title: string; status: string }[];
	origin: string;
}): string {
	const { ticket: t, users: dir, origin } = input;
	const out: string[] = [];
	out.push(`# ${t.displayId} · ${t.subject}`);
	out.push('');
	out.push(`- Org: ${t.orgName} (${t.displayId.slice(0, t.displayId.lastIndexOf('-'))})`);
	out.push(
		`- Status: ${t.status} · Priority: ${t.priority} · Category: ${t.category} · Channel: ${t.channel}`
	);
	out.push(
		`- Customer: ${userName(dir, t.customerId)} · Created by: ${userName(dir, t.createdBy)} · Assignees: ${userNames(dir, t.assignees)}`
	);
	out.push(`- Tags: ${t.tags.length ? t.tags.join(', ') : '—'}`);
	out.push(`- Created: ${t.createdAt} · Updated: ${t.updatedAt}`);
	if (t.firstResponseAt) out.push(`- First response: ${t.firstResponseAt}`);
	if (t.resolvedAt) out.push(`- Resolved: ${t.resolvedAt}`);
	if (t.closedAt) out.push(`- Closed: ${t.closedAt}`);
	if (t.satisfactionScore != null) out.push(`- Satisfaction: ${t.satisfactionScore}`);
	out.push('');
	out.push('## Description');
	out.push('');
	out.push(t.description?.trim() || '_none_');
	out.push('');
	out.push(`## Checklist (${checklistSummary(t.checklist)})`);
	out.push('');
	out.push(checklistMd(t.checklist));
	out.push('');
	out.push('## Attachments');
	out.push('');
	out.push(attachmentsMd(input.attachments, origin));
	if (input.linkedTasks.length) {
		out.push('');
		out.push('## Linked tasks');
		out.push('');
		for (const lt of input.linkedTasks) {
			out.push(`- **${lt.displayId}** ${lt.title} · ${lt.status}`);
		}
	}
	out.push('');
	const human = input.messages.filter((m) => m.kind === 'comment').length;
	out.push(`## Timeline (${human} messages)`);
	out.push('');
	if (input.messages.length === 0) out.push('_no messages yet_');
	for (const m of input.messages) {
		if (m.kind === 'system') {
			out.push(
				`- _${m.createdAt} · ${userName(dir, m.authorId)} · ${systemEventText(m.meta, m.body, dir)}_`
			);
			continue;
		}
		const flag = m.isInternalNote ? ' · INTERNAL NOTE' : '';
		out.push(`### ${userName(dir, m.authorId)} · ${m.createdAt}${flag}`);
		out.push('');
		out.push(m.body.trim() || '_empty_');
		if (m.attachments.length) {
			out.push('');
			out.push(attachmentsMd(m.attachments, origin));
		}
		out.push('');
	}
	return out.join('\n').trimEnd();
}

// ─── Tasks ──────────────────────────────────────────────────────────────────

export function taskLine(t: Task, dir: UserDirectory): string {
	const bits = [
		`**${t.id}** ${truncate(t.title, 90)}`,
		t.status,
		t.priority,
		t.type ?? 'task',
		`assignees: ${userNames(dir, t.assignees)}`,
		t.due ? `due ${t.due}` : null,
		`updated ${t.updated}`
	].filter((b): b is string => !!b);
	return `- ${bits.join(' · ')}`;
}

export type TaskRowSummary = {
	key: string;
	title: string;
	status: string;
	priority: string;
	type: string;
	projectKey: string;
	assignees: { id: string; name: string }[];
	due: string | null;
	tags: string[];
	updated: string;
	checklist: string;
};

export function taskSummary(t: Task, dir: UserDirectory): TaskRowSummary {
	return {
		key: t.id,
		title: t.title,
		status: t.status,
		priority: t.priority,
		type: t.type ?? 'task',
		projectKey: t.project,
		assignees: (t.assignees ?? []).map((id) => ({ id, name: userName(dir, id) })),
		due: t.due,
		tags: t.tags ?? t.labels ?? [],
		updated: t.updated,
		checklist: checklistSummary(t.checklist ?? [])
	};
}

function minutesToHuman(min: number): string {
	const h = Math.floor(min / 60);
	const m = min % 60;
	if (h === 0) return `${m}m`;
	return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function taskDetailMd(input: { task: Task; users: UserDirectory; origin: string }): string {
	const { task: t, users: dir, origin } = input;
	const out: string[] = [];
	out.push(`# ${t.id} · ${t.title}`);
	out.push('');
	out.push(
		`- Project: ${t.project} · Status: ${t.status} · Priority: ${t.priority} · Type: ${t.type ?? 'task'}`
	);
	out.push(
		`- Assignees: ${userNames(dir, t.assignees)} · Created by: ${userName(dir, t.createdBy)} · Created: ${t.createdAt ?? '—'} · Channel: ${t.channel ?? 'web'}`
	);
	out.push(
		`- Due: ${t.due ?? '—'} · Estimate: ${t.estimate != null ? minutesToHuman(t.estimate) : '—'} · Updated: ${t.updated}`
	);
	const tags = t.tags ?? t.labels ?? [];
	out.push(`- Tags: ${tags.length ? tags.join(', ') : '—'}`);
	if (t.parent) out.push(`- Parent task: ${t.parent}`);
	if (t.startDate || t.endDate)
		out.push(`- Start: ${t.startDate ?? '—'} · End: ${t.endDate ?? '—'}`);
	if (t.inMyPlan) out.push(`- In your plan: ${t.plannedFor ?? 'undated'}`);
	if (t.sourceTicket) out.push(`- Source ticket: ${t.sourceTicket.displayId}`);
	out.push('');
	out.push('## Description');
	out.push('');
	out.push(t.description?.trim() || '_none_');
	out.push('');
	const checklist = t.checklist ?? [];
	out.push(`## Checklist (${checklistSummary(checklist)})`);
	out.push('');
	out.push(checklistMd(checklist));
	out.push('');
	out.push('## Attachments');
	out.push('');
	out.push(attachmentsMd(t.files ?? [], origin));
	out.push('');
	const comments = t.comments ?? [];
	out.push(`## Comments (${comments.length})`);
	out.push('');
	if (comments.length === 0) out.push('_none_');
	for (const c of comments) {
		out.push(`### ${userName(dir, c.user)} · ${c.createdAt ?? c.date}`);
		out.push('');
		out.push(c.text.trim() || '_empty_');
		if (c.files?.length) {
			out.push('');
			out.push(attachmentsMd(c.files, origin));
		}
		out.push('');
	}
	const logs = t.timeLogs ?? [];
	const total = logs.reduce((acc, l) => acc + l.minutes, 0);
	out.push(`## Time logs (${logs.length}, total ${minutesToHuman(total)})`);
	out.push('');
	if (logs.length === 0) out.push('_none_');
	for (const l of logs) {
		out.push(
			`- ${l.date} · ${userName(dir, l.user)} · ${minutesToHuman(l.minutes)}${l.note ? ` · ${l.note}` : ''}`
		);
	}
	return out.join('\n').trimEnd();
}

// ─── Projects ───────────────────────────────────────────────────────────────
// W2 owns the project loaders; the row shape below is the structural subset
// this module reads, so either loader output formats without a cast chain.

export type ProjectRowLike = {
	id: string;
	key: string;
	name: string;
	description?: string | null;
	status?: string | null;
	color?: string | null;
	tags?: string[] | null;
	orgId?: string | null;
	orgKey?: string | null;
	orgName?: string | null;
	leadId?: string | null;
	taskCount?: number | null;
	openTaskCount?: number | null;
	members?: { id: string; name: string }[] | null;
	createdAt?: string | Date | null;
	updatedAt?: string | Date | null;
};

export function projectLine(p: ProjectRowLike): string {
	const bits = [
		`**${p.key}** ${truncate(p.name, 80)}`,
		p.status ?? 'active',
		p.orgKey ? `org ${p.orgKey}` : p.orgName ? `org ${p.orgName}` : 'internal',
		p.tags?.length ? `tags ${p.tags.join(', ')}` : null,
		p.openTaskCount != null
			? `${p.openTaskCount} open tasks`
			: p.taskCount != null
				? `${p.taskCount} tasks`
				: null,
		p.updatedAt ? `updated ${iso(p.updatedAt)}` : null
	].filter((b): b is string => !!b);
	return `- ${bits.join(' · ')}`;
}

export function projectSummary(p: ProjectRowLike, origin?: string) {
	return {
		id: p.id,
		key: p.key,
		name: p.name,
		status: p.status ?? 'active',
		orgKey: p.orgKey ?? null,
		orgName: p.orgName ?? null,
		tags: p.tags ?? [],
		taskCount: p.openTaskCount ?? p.taskCount ?? null,
		updatedAt: iso(p.updatedAt) ?? null,
		url: origin ? projectUrl(origin, p.id) : null
	};
}

export function projectDetailMd(p: ProjectRowLike, dir: UserDirectory, extra?: string): string {
	const out: string[] = [];
	out.push(`# ${p.key} · ${p.name}`);
	out.push('');
	out.push(`- Status: ${p.status ?? 'active'}`);
	out.push(`- Org: ${p.orgName ?? p.orgKey ?? 'internal (no client org)'}`);
	out.push(`- Lead: ${userName(dir, p.leadId ?? null)}`);
	if (p.tags?.length) out.push(`- Tags: ${p.tags.join(', ')}`);
	if (p.openTaskCount != null || p.taskCount != null) {
		out.push(`- Open tasks: ${p.openTaskCount ?? p.taskCount}`);
	}
	if (p.members?.length) out.push(`- Members: ${p.members.map((m) => m.name).join(', ')}`);
	if (p.createdAt) out.push(`- Created: ${iso(p.createdAt)}`);
	if (p.updatedAt) out.push(`- Updated: ${iso(p.updatedAt)}`);
	out.push('');
	out.push('## Description');
	out.push('');
	out.push(p.description?.trim() || '_none_');
	if (extra) {
		out.push('');
		out.push(extra);
	}
	return out.join('\n').trimEnd();
}

// ─── App links + detail DTOs (MCP Apps widgets) ─────────────────────────────
// The structured payloads the `ui://trackr/*.html` widgets render. Every
// task/ticket read AND write tool returns the full record in this shape so
// the host can show the updated item after a change. Ids stay human (display
// ids) where the model needs them; uuids ride along for links.

export const taskUrl = (origin: string, key: string) =>
	`${origin}/tasks?task=${encodeURIComponent(key)}`;
export const ticketUrl = (origin: string, id: string) => `${origin}/tickets/${id}`;
export const projectUrl = (origin: string, id: string) => `${origin}/projects/${id}`;

export type AttachmentSummary = {
	id: string;
	filename: string;
	mimeType: string;
	sizeBytes: number;
	width: number | null;
	height: number | null;
	url: string;
};

function attachmentSummary(a: AttachmentDTO, origin: string): AttachmentSummary {
	return {
		id: a.id,
		filename: a.filename,
		mimeType: a.mimeType,
		sizeBytes: a.sizeBytes,
		width: a.width ?? null,
		height: a.height ?? null,
		url: attachmentDownloadUrl(origin, a.id)
	};
}

export type TaskDetailDto = {
	kind: 'task';
	key: string;
	id: string | null;
	url: string;
	title: string;
	projectKey: string;
	status: string;
	priority: string;
	type: string;
	assignees: { id: string; name: string }[];
	createdBy: { id: string; name: string } | null;
	createdAt: string | null;
	updatedAt: string;
	due: string | null;
	estimateMinutes: number | null;
	tags: string[];
	channel: string;
	plannedFor: string | null;
	inMyPlan: boolean;
	sourceTicket: { id: string; displayId: string } | null;
	description: string;
	checklist: ChecklistItemLike[];
	attachments: AttachmentSummary[];
	comments: {
		id: string | null;
		author: { id: string; name: string };
		body: string;
		createdAt: string;
		attachments: AttachmentSummary[];
	}[];
	timeLogs: { user: { id: string; name: string }; date: string; minutes: number; note: string }[];
	totalMinutes: number;
};

export function taskDetailDto(t: Task, dir: UserDirectory, origin: string): TaskDetailDto {
	const logs = t.timeLogs ?? [];
	return {
		kind: 'task',
		key: t.id,
		id: t.uuid ?? null,
		url: taskUrl(origin, t.id),
		title: t.title,
		projectKey: t.project,
		status: t.status,
		priority: t.priority,
		type: t.type ?? 'task',
		assignees: (t.assignees ?? []).map((id) => ({ id, name: userName(dir, id) })),
		createdBy: t.createdBy ? { id: t.createdBy, name: userName(dir, t.createdBy) } : null,
		createdAt: iso(t.createdAt),
		updatedAt: t.updated,
		due: t.due,
		estimateMinutes: t.estimate ?? null,
		tags: t.tags ?? t.labels ?? [],
		channel: t.channel ?? 'web',
		plannedFor: t.plannedFor ?? null,
		inMyPlan: !!t.inMyPlan,
		sourceTicket: t.sourceTicket ?? null,
		description: t.description ?? '',
		checklist: (t.checklist ?? []).map((c) => ({ id: c.id, text: c.text, done: c.done })),
		attachments: (t.files ?? []).map((a) => attachmentSummary(a, origin)),
		comments: (t.comments ?? []).map((c) => ({
			id: c.id ?? null,
			author: { id: c.user, name: userName(dir, c.user) },
			body: c.text,
			createdAt: c.createdAt ?? c.date,
			attachments: (c.files ?? []).map((a) => attachmentSummary(a, origin))
		})),
		timeLogs: logs.map((l) => ({
			user: { id: l.user, name: userName(dir, l.user) },
			date: l.date,
			minutes: l.minutes,
			note: l.note
		})),
		totalMinutes: logs.reduce((acc, l) => acc + l.minutes, 0)
	};
}

export type TicketDetailDto = {
	kind: 'ticket';
	key: string;
	id: string;
	url: string;
	subject: string;
	orgKey: string;
	orgName: string;
	status: string;
	priority: string;
	category: string;
	channel: string;
	customer: { id: string; name: string } | null;
	assignees: { id: string; name: string }[];
	createdBy: { id: string; name: string } | null;
	createdAt: string;
	updatedAt: string;
	firstResponseAt: string | null;
	resolvedAt: string | null;
	closedAt: string | null;
	tags: string[];
	description: string;
	checklist: ChecklistItemLike[];
	attachments: AttachmentSummary[];
	linkedTasks: { key: string; title: string; status: string; url: string }[];
	messages: {
		id: string;
		kind: string;
		internal: boolean;
		author: { id: string; name: string } | null;
		body: string;
		createdAt: string;
		attachments: AttachmentSummary[];
	}[];
	messageCount: number;
};

export function ticketDetailDto(input: {
	ticket: TicketRow;
	messages: readonly TicketMessageWithFiles[];
	attachments: readonly AttachmentDTO[];
	users: UserDirectory;
	linkedTasks: readonly { displayId: string; title: string; status: string }[];
	origin: string;
}): TicketDetailDto {
	const { ticket: t, users: dir, origin } = input;
	const person = (id: string | null | undefined) => (id ? { id, name: userName(dir, id) } : null);
	return {
		kind: 'ticket',
		key: t.displayId,
		id: t.id,
		url: ticketUrl(origin, t.id),
		subject: t.subject,
		orgKey: t.displayId.slice(0, t.displayId.lastIndexOf('-')),
		orgName: t.orgName,
		status: t.status,
		priority: t.priority,
		category: t.category,
		channel: t.channel,
		customer: person(t.customerId),
		assignees: t.assignees.map((id) => ({ id, name: userName(dir, id) })),
		createdBy: person(t.createdBy),
		createdAt: t.createdAt,
		updatedAt: t.updatedAt,
		firstResponseAt: t.firstResponseAt,
		resolvedAt: t.resolvedAt,
		closedAt: t.closedAt,
		tags: t.tags,
		description: t.description ?? '',
		checklist: t.checklist.map((c) => ({ id: c.id, text: c.text, done: c.done })),
		attachments: input.attachments.map((a) => attachmentSummary(a, origin)),
		linkedTasks: input.linkedTasks.map((lt) => ({
			key: lt.displayId,
			title: lt.title,
			status: lt.status,
			url: taskUrl(origin, lt.displayId)
		})),
		messages: input.messages.map((m) => ({
			id: m.id,
			kind: m.kind,
			internal: m.isInternalNote,
			author: person(m.authorId),
			// System events are rendered per-locale in the app; here the same
			// plain-English line the markdown view uses.
			body: m.kind === 'system' ? systemEventText(m.meta, m.body, dir) : m.body,
			createdAt: m.createdAt,
			attachments: m.attachments.map((a) => attachmentSummary(a, origin))
		})),
		messageCount: t.messageCount
	};
}
