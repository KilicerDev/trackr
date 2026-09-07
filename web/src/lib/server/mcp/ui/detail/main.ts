// Detail widget — the MCP App behind get_task / create_task / update_task /
// log_time / checklist_toggle and get_ticket / create_ticket / update_ticket
// (ui://trackr/detail.html). Renders the full record the tool returned
// (`structuredContent.task` or `.ticket`, see taskDetailDto / ticketDetailDto
// in $lib/server/mcp/format.ts) and lets the user act on it through the host:
// checklist toggles call `checklist_toggle`, the status select calls
// `update_task` / `update_ticket`, links and attachments open in trackr.

import {
	badge,
	callTool,
	connectApp,
	dateOnly,
	el,
	formatBytes,
	minutesToHuman,
	openLink,
	payloadOf,
	priorityBars,
	relative,
	reportSize,
	type ToolResultLike
} from '../shared/host';
import {
	PRIORITY,
	statusMeta,
	TASK_STATUS,
	TASK_TYPE,
	TICKET_CATEGORY,
	TICKET_STATUS,
	type StatusMeta
} from '../shared/taxonomy';
import { renderMarkdown } from './markdown';

type Person = { id: string; name: string };
type Attachment = {
	id: string;
	filename: string;
	mimeType: string;
	sizeBytes: number;
	url: string;
};
type ChecklistItem = { id: string; text: string; done: boolean };
type Task = {
	kind: 'task';
	key: string;
	url: string;
	title: string;
	projectKey: string;
	status: string;
	priority: string;
	type: string;
	assignees: Person[];
	createdBy: Person | null;
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
	checklist: ChecklistItem[];
	attachments: Attachment[];
	comments: {
		id: string | null;
		author: Person;
		body: string;
		createdAt: string;
		attachments: Attachment[];
	}[];
	timeLogs: { user: Person; date: string; minutes: number; note: string }[];
	totalMinutes: number;
};
type Ticket = {
	kind: 'ticket';
	key: string;
	url: string;
	subject: string;
	orgKey: string;
	orgName: string;
	status: string;
	priority: string;
	category: string;
	channel: string;
	customer: Person | null;
	assignees: Person[];
	createdBy: Person | null;
	createdAt: string;
	updatedAt: string;
	tags: string[];
	description: string;
	checklist: ChecklistItem[];
	attachments: Attachment[];
	linkedTasks: { key: string; title: string; status: string; url: string }[];
	messages: {
		id: string;
		kind: string;
		internal: boolean;
		author: Person | null;
		body: string;
		createdAt: string;
		attachments: Attachment[];
	}[];
	messageCount: number;
};
type Item = Task | Ticket;
type Payload = { task?: Task; ticket?: Ticket; changed?: boolean };

const root = document.getElementById('root')!;
const errorBox = document.getElementById('error')!;
let item: Item | null = null;
let busy = false;
let toast: string | null = null;

function showError(msg: string) {
	errorBox.textContent = msg;
	errorBox.hidden = false;
	queueMicrotask(reportSize);
}

const hasItem = (v: Partial<Payload>) => !!(v.task || v.ticket);

function accept(result: ToolResultLike) {
	const payload = payloadOf<Payload>(result, hasItem);
	if (!payload) {
		showError('No task or ticket in the tool result.');
		return;
	}
	errorBox.hidden = true;
	item = payload.task ?? payload.ticket ?? null;
	toast = payload.changed === false ? 'No changes were needed.' : null;
	render();
}

// ─── Actions (through the host) ─────────────────────────────────────────────

async function act(label: string, run: () => Promise<Payload>) {
	if (!item || busy) return;
	busy = true;
	render();
	try {
		const payload = await run();
		item = payload.task ?? payload.ticket ?? item;
		toast = label;
		errorBox.hidden = true;
	} catch (err) {
		showError((err as Error).message);
	} finally {
		busy = false;
		render();
	}
}

function toggleChecklist(entry: ChecklistItem, done: boolean) {
	if (!item) return;
	const target = item.kind;
	const key = item.key;
	void act(`Checklist updated.`, () =>
		callTool<Payload>('checklist_toggle', { target, key, itemId: entry.id, done }, hasItem)
	);
}

function changeStatus(status: string) {
	if (!item) return;
	const tool = item.kind === 'task' ? 'update_task' : 'update_ticket';
	void act(`Status set to ${status.replace(/_/g, ' ')}.`, () =>
		callTool<Payload>(tool, { key: item!.key, status }, hasItem)
	);
}

function open(url: string) {
	openLink(url).catch((err: Error) => showError(`Could not open: ${err.message}`));
}

// ─── Render ─────────────────────────────────────────────────────────────────

function statusSelect(current: string, map: Record<string, StatusMeta>): HTMLElement {
	const meta = statusMeta(map, current);
	const select = el('select', { class: 'control', 'aria-label': 'Status', '--dot': meta.dot });
	for (const [id, m] of Object.entries(map)) {
		const opt = el('option', { value: id }, m.label);
		if (id === current) opt.selected = true;
		select.append(opt);
	}
	if (!map[current]) {
		const opt = el('option', { value: current }, current);
		opt.selected = true;
		select.append(opt);
	}
	select.disabled = busy;
	select.onchange = () => changeStatus(select.value);
	return el('span', { class: 'status-select' }, badge(meta), ' ', select);
}

function metaCell(label: string, value: Node | string | null | undefined): HTMLElement | null {
	if (value === null || value === undefined || value === '') return null;
	return el('div', {}, el('span', { class: 'k' }, label), el('span', { class: 'v' }, value));
}

function people(list: Person[]): string {
	return list.map((p) => p.name).join(', ');
}

function tagList(tags: string[]): Node | null {
	if (!tags.length) return null;
	return el('span', { class: 'tags' }, ...tags.map((t) => el('span', { class: 'tag' }, t)));
}

function files(list: Attachment[]): HTMLElement {
	return el(
		'div',
		{ class: 'files' },
		...list.map((a) => {
			const b = el(
				'button',
				{ type: 'button', class: 'file', title: `${a.mimeType} · ${formatBytes(a.sizeBytes)}` },
				el('span', { class: 'name' }, a.filename),
				el('span', { class: 'muted' }, formatBytes(a.sizeBytes))
			);
			b.onclick = () => open(a.url);
			return b;
		})
	);
}

function checklist(items: ChecklistItem[]): HTMLElement[] {
	if (!items.length) return [el('div', { class: 'muted' }, 'No checklist.')];
	const done = items.filter((i) => i.done).length;
	const ul = el(
		'ul',
		{ class: 'checklist' },
		...items.map((entry) => {
			const box = el('input', { type: 'checkbox', id: `c-${entry.id}` });
			box.checked = entry.done;
			box.disabled = busy;
			box.onchange = () => toggleChecklist(entry, box.checked);
			return el(
				'li',
				{ class: [entry.done ? 'done' : '', busy ? 'busy' : ''].join(' ').trim() || undefined },
				box,
				el('label', { for: `c-${entry.id}` }, el('span', {}, entry.text))
			);
		})
	);
	const bar = el(
		'div',
		{ class: 'progress' },
		el('i', { style: `width:${Math.round((done / items.length) * 100)}%` })
	);
	return [el('div', { class: 'muted' }, `${done} of ${items.length} done`), bar, ul];
}

function markdown(md: string): HTMLElement {
	const box = el('div', { class: 'md' });
	if (!md.trim()) box.append(el('span', { class: 'muted' }, 'No description.'));
	else box.append(renderMarkdown(md));
	// Links open through the host, never inside the sandbox.
	box.addEventListener('click', (ev) => {
		const a = (ev.target as HTMLElement).closest('a');
		if (!a?.href) return;
		ev.preventDefault();
		open(a.href);
	});
	return box;
}

function section(title: string, ...children: (Node | string | null)[]): HTMLElement {
	return el('section', {}, el('h2', {}, title), ...children);
}

function renderTask(t: Task): HTMLElement[] {
	const type = TASK_TYPE[t.type];
	return [
		el(
			'div',
			{ class: 'head' },
			el('span', { class: 'mono key' }, t.key),
			el('h1', {}, t.title),
			el('div', { class: 'actions' }, statusSelect(t.status, TASK_STATUS), openButton(t.url))
		),
		el(
			'div',
			{ class: 'meta' },
			metaCell('Project', t.projectKey),
			metaCell(
				'Priority',
				el('span', {}, priorityBars(t.priority), ' ', PRIORITY[t.priority]?.label ?? t.priority)
			),
			metaCell('Type', type ? el('span', { style: `color:${type.color}` }, type.label) : t.type),
			metaCell('Assignees', people(t.assignees) || '—'),
			metaCell('Due', t.due ? dateOnly(t.due) : null),
			metaCell('Estimate', t.estimateMinutes != null ? minutesToHuman(t.estimateMinutes) : null),
			metaCell('Tags', tagList(t.tags)),
			metaCell('Planned', t.inMyPlan ? (t.plannedFor ?? 'this week') : null),
			metaCell('Created', `${t.createdBy?.name ?? '—'} · ${relative(t.createdAt)}`),
			metaCell('Updated', relative(t.updatedAt)),
			metaCell('Source ticket', t.sourceTicket?.displayId ?? null)
		),
		section('Description', markdown(t.description)),
		section('Checklist', ...checklist(t.checklist)),
		t.attachments.length ? section('Attachments', files(t.attachments)) : null,
		section(
			`Comments (${t.comments.length})`,
			t.comments.length
				? el(
						'div',
						{ class: 'timeline' },
						...t.comments.map((c) =>
							el(
								'div',
								{ class: 'msg' },
								el(
									'div',
									{ class: 'who' },
									el('b', {}, c.author.name),
									el('span', {}, relative(c.createdAt))
								),
								markdown(c.body),
								c.attachments.length ? files(c.attachments) : null
							)
						)
					)
				: el('div', { class: 'muted' }, 'No comments.')
		),
		section(
			`Time logs (${minutesToHuman(t.totalMinutes)})`,
			t.timeLogs.length
				? el(
						'table',
						{ class: 'logs' },
						...t.timeLogs.map((l) =>
							el(
								'tr',
								{},
								el('td', { class: 'mono muted' }, dateOnly(l.date)),
								el('td', {}, l.user.name),
								el('td', { class: 'mono' }, minutesToHuman(l.minutes)),
								el('td', { class: 'muted' }, l.note || '')
							)
						)
					)
				: el('div', { class: 'muted' }, 'No time logged.')
		)
	].filter((n): n is HTMLElement => n !== null);
}

function renderTicket(t: Ticket): HTMLElement[] {
	const category = TICKET_CATEGORY[t.category];
	return [
		el(
			'div',
			{ class: 'head' },
			el('span', { class: 'mono key' }, t.key),
			el('h1', {}, t.subject),
			el('div', { class: 'actions' }, statusSelect(t.status, TICKET_STATUS), openButton(t.url))
		),
		el(
			'div',
			{ class: 'meta' },
			metaCell('Organization', `${t.orgName} (${t.orgKey})`),
			metaCell(
				'Priority',
				el('span', {}, priorityBars(t.priority), ' ', PRIORITY[t.priority]?.label ?? t.priority)
			),
			metaCell(
				'Category',
				category ? el('span', { style: `color:${category.color}` }, category.label) : t.category
			),
			metaCell('Customer', t.customer?.name ?? null),
			metaCell('Assignees', people(t.assignees) || '—'),
			metaCell('Tags', tagList(t.tags)),
			metaCell('Channel', t.channel),
			metaCell('Created', `${t.createdBy?.name ?? '—'} · ${relative(t.createdAt)}`),
			metaCell('Updated', relative(t.updatedAt))
		),
		section('Description', markdown(t.description)),
		section('Checklist', ...checklist(t.checklist)),
		t.attachments.length ? section('Attachments', files(t.attachments)) : null,
		t.linkedTasks.length
			? section(
					'Linked tasks',
					el(
						'div',
						{ class: 'linked' },
						...t.linkedTasks.map((lt) => {
							const b = el(
								'button',
								{ type: 'button', class: 'btn' },
								el('span', { class: 'mono' }, lt.key),
								lt.title,
								badge(statusMeta(TASK_STATUS, lt.status))
							);
							b.onclick = () => open(lt.url);
							return b;
						})
					)
				)
			: null,
		section(
			`Timeline (${t.messages.filter((m) => m.kind === 'comment').length} messages)`,
			t.messages.length
				? el(
						'div',
						{ class: 'timeline' },
						...t.messages.map((m) =>
							m.kind === 'system'
								? el(
										'div',
										{ class: 'event' },
										`${relative(m.createdAt)} · ${m.author?.name ?? 'system'} · ${m.body}`
									)
								: el(
										'div',
										{ class: m.internal ? 'msg internal' : 'msg' },
										el(
											'div',
											{ class: 'who' },
											el('b', {}, m.author?.name ?? '—'),
											el('span', {}, relative(m.createdAt)),
											m.internal ? el('span', { class: 'flag' }, 'internal note') : null
										),
										markdown(m.body),
										m.attachments.length ? files(m.attachments) : null
									)
						)
					)
				: el('div', { class: 'muted' }, 'No messages yet.')
		)
	].filter((n): n is HTMLElement => n !== null);
}

function openButton(url: string): HTMLElement {
	const b = el('button', { type: 'button', class: 'btn' }, 'Open in trackr ↗');
	b.onclick = () => open(url);
	return b;
}

function render() {
	if (!item) return;
	const nodes = item.kind === 'task' ? renderTask(item) : renderTicket(item);
	if (toast) nodes.push(el('div', { class: 'toast' }, toast));
	root.replaceChildren(...nodes);
	queueMicrotask(reportSize);
}

connectApp({ name: 'trackr-detail', onResult: accept, onError: showError });
