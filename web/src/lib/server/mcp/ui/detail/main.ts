// Detail widget — the MCP App behind get_task / create_task / update_task /
// log_time / checklist_toggle and get_ticket / create_ticket / update_ticket
// (ui://trackr/detail.html). Renders the full record the tool returned
// (`structuredContent.task` or `.ticket`, see taskDetailDto / ticketDetailDto
// in $lib/server/mcp/format.ts).
//
// Tasks are interactive: checklist toggles call `checklist_toggle`, the status
// select calls `update_task`. Tickets are a read-only view laid out like the
// app's ticket page (header line, title, properties rail, opening message,
// details, activity timeline) — the only actions are the links, which open
// in trackr through the host.

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
import { avatar, avatarStack, icon, taskStatusDot } from '../shared/ui';
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
	orgColor: string;
	status: string;
	priority: string;
	category: string;
	channel: string;
	customer: Person | null;
	assignees: Person[];
	createdBy: Person | null;
	createdAt: string;
	updatedAt: string;
	firstResponseAt: string | null;
	resolvedAt: string | null;
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

// ─── Ticket ─────────────────────────────────────────────────────────────────

const CHANNEL_LABEL: Record<string, string> = {
	web_form: 'Web form',
	email: 'Email',
	chat: 'Chat',
	api: 'API'
};

type TicketMessage = Ticket['messages'][number];
/** Timeline entries: a message, or a run of consecutive system events. */
type TimelineGroup =
	| { kind: 'message'; m: TicketMessage }
	| { kind: 'events'; items: TicketMessage[] };

/** Folded event runs the user has opened, by the first event's id; survives re-render. */
const openedRuns = new Set<string>();

function fullDate(iso: string | null | undefined): string {
	if (!iso) return '—';
	const t = new Date(iso);
	return Number.isFinite(t.getTime()) ? t.toLocaleDateString() : iso;
}

function label(title: string, count?: number | string): HTMLElement {
	return el(
		'div',
		{ class: 'label' },
		title,
		count !== undefined && count !== '' ? el('span', { class: 'count' }, String(count)) : null
	);
}

/** A read-only property chip of the rail: marker + text. */
function pill(marker: Node | null, text: string, cls = 'pill'): HTMLElement {
	return el('span', { class: cls }, marker, el('span', {}, text));
}

/** A row that opens something in trackr: leading marker, text, trailing cells. */
function linkRow(url: string, ...cells: (Node | string | null)[]): HTMLElement {
	const b = el(
		'button',
		{ type: 'button', class: 'rowlink' },
		...cells,
		icon('arrow-up-right', 13)
	);
	b.onclick = () => open(url);
	return b;
}

function ticketChecklist(items: ChecklistItem[]): HTMLElement[] {
	const done = items.filter((i) => i.done).length;
	return [
		el(
			'ul',
			{ class: 'checklist static' },
			...items.map((entry) =>
				el(
					'li',
					{ class: entry.done ? 'done' : undefined },
					icon(entry.done ? 'check-square' : 'square', 14),
					el('span', {}, entry.text)
				)
			)
		),
		el('div', { class: 'muted' }, `${done} of ${items.length} done`)
	];
}

function groupTimeline(messages: TicketMessage[]): TimelineGroup[] {
	const out: TimelineGroup[] = [];
	for (const m of messages) {
		if (m.kind !== 'system') {
			out.push({ kind: 'message', m });
			continue;
		}
		const last = out[out.length - 1];
		if (last?.kind === 'events') last.items.push(m);
		else out.push({ kind: 'events', items: [m] });
	}
	return out;
}

/** What a run of system events touched, from the plain-English lines format.ts writes. */
function eventKinds(items: TicketMessage[]): string {
	const kinds = new Set<string>();
	for (const { body } of items) {
		if (/^status:/.test(body)) kinds.add('status');
		else if (/^priority:/.test(body)) kinds.add('priority');
		else if (/^category:/.test(body)) kinds.add('category');
		else if (/^(un)?assigned\b/.test(body)) kinds.add('assignees');
		else if (/^subject:/.test(body)) kinds.add('subject');
		else if (/^tags:/.test(body)) kinds.add('tags');
		else kinds.add('other');
	}
	return [...kinds].join(', ');
}

function eventLine(m: TicketMessage): HTMLElement {
	return el(
		'div',
		{ class: 'event' },
		el('span', { class: 'evdot' }),
		el(
			'div',
			{ class: 'text' },
			el('span', { class: 'who' }, m.author?.name ?? 'system'),
			' ',
			m.body,
			' ',
			el('span', { class: 'mono when' }, `· ${relative(m.createdAt)}`)
		)
	);
}

function eventRun(items: TicketMessage[]): HTMLElement[] {
	if (items.length === 1) return [eventLine(items[0])];
	const id = items[0].id;
	const opened = openedRuns.has(id);
	const toggle = el(
		'button',
		{ type: 'button', class: 'fold', 'aria-expanded': String(opened) },
		icon('chevron', 14),
		`${items.length} changes on ${fullDate(items[0].createdAt)}`,
		el('span', { class: 'muted' }, ` · ${eventKinds(items)}`)
	);
	toggle.onclick = () => {
		if (opened) openedRuns.delete(id);
		else openedRuns.add(id);
		render();
	};
	const head = el('div', { class: 'event' }, el('span', { class: 'evdot' }), toggle);
	return opened ? [head, ...items.map(eventLine)] : [head];
}

function messageEntry(m: TicketMessage): HTMLElement {
	const author = m.author;
	return el(
		'div',
		{ class: 'entry' },
		el(
			'span',
			{ class: 'bullet' },
			author ? avatar(author, 18) : el('span', { class: 'avatar', '--size': '18px' }, '?')
		),
		el(
			'div',
			{ class: 'byline' },
			el('span', { class: 'who' }, author?.name ?? '—'),
			m.internal ? ' added an ' : ' replied ',
			m.internal ? el('span', { class: 'internal' }, 'internal note') : null,
			' ',
			el('span', { class: 'mono when' }, `· ${relative(m.createdAt)}`)
		),
		el('div', { class: m.internal ? 'bubble internal' : 'bubble' }, markdown(m.body)),
		m.attachments.length ? files(m.attachments) : null
	);
}

function renderTicket(t: Ticket): HTMLElement[] {
	const status = statusMeta(TICKET_STATUS, t.status);
	const category = TICKET_CATEGORY[t.category];
	const opener = t.createdBy ?? t.customer;
	const channel = CHANNEL_LABEL[t.channel] ?? t.channel;
	const messages = t.messages.filter((m) => m.kind !== 'system').length;

	const blocks: (HTMLElement | null)[] = [
		t.linkedTasks.length
			? el(
					'div',
					{ class: 'block' },
					label('Linked tasks', t.linkedTasks.length),
					el(
						'div',
						{ class: 'rows' },
						...t.linkedTasks.map((lt) =>
							linkRow(
								lt.url,
								taskStatusDot(lt.status),
								el('span', { class: 'mono key' }, lt.key),
								el('span', { class: 'text' }, lt.title)
							)
						)
					)
				)
			: null,
		t.attachments.length
			? el(
					'div',
					{ class: 'block' },
					label('Attachments', t.attachments.length),
					el(
						'div',
						{ class: 'rows' },
						...t.attachments.map((a) =>
							linkRow(
								a.url,
								icon('paperclip', 14),
								el('span', { class: 'text', title: a.mimeType }, a.filename),
								el('span', { class: 'muted' }, formatBytes(a.sizeBytes))
							)
						)
					)
				)
			: null,
		t.checklist.length
			? el(
					'div',
					{ class: 'block' },
					label('Checklist', `${t.checklist.filter((c) => c.done).length}/${t.checklist.length}`),
					...ticketChecklist(t.checklist)
				)
			: null
	];
	const details = blocks.filter((n): n is HTMLElement => n !== null);

	const nodes: (HTMLElement | null)[] = [
		el(
			'div',
			{ class: 'tk-head' },
			el('span', { class: 'mono key' }, t.key),
			el('span', { class: 'org' }, el('span', { class: 'gdot', '--dot': t.orgColor }), t.orgName),
			el('div', { class: 'actions' }, openButton(t.url))
		),
		el('h1', { class: 'tk-title' }, t.subject),
		el(
			'div',
			{ class: 'rail' },
			pill(el('span', { class: 'dot', '--dot': status.dot }), status.label),
			pill(priorityBars(t.priority), PRIORITY[t.priority]?.label ?? t.priority),
			category ? pill(el('span', { class: 'dot', '--dot': category.color }), category.label) : null,
			t.assignees.length
				? el(
						'span',
						{ class: 'pill' },
						avatarStack(t.assignees, 20),
						el('span', { class: 'names' }, people(t.assignees)),
						el(
							'span',
							{ class: 'count' },
							t.assignees.length === 1 ? t.assignees[0].name : `${t.assignees.length} assignees`
						)
					)
				: pill(icon('user', 14), 'Unassigned', 'pill dashed'),
			...t.tags.map((tag) => el('span', { class: 'pill tag' }, tag))
		),
		el(
			'div',
			{ class: 'opening' },
			el(
				'div',
				{ class: 'byline' },
				opener ? avatar(opener, 18) : null,
				el('span', { class: 'who' }, opener?.name ?? '—'),
				` opened this via ${channel === 'API' ? channel : channel.toLowerCase()} `,
				el('span', { class: 'mono when' }, `· ${fullDate(t.createdAt)}`)
			),
			markdown(t.description)
		),
		details.length ? el('div', { class: 'details' }, ...details) : null,
		el(
			'div',
			{ class: 'activity' },
			label('Activity', messages ? `${messages} ${messages === 1 ? 'message' : 'messages'}` : ''),
			t.messages.length
				? el(
						'div',
						{ class: 'timeline' },
						...groupTimeline(t.messages).flatMap((g) =>
							g.kind === 'message' ? [messageEntry(g.m)] : eventRun(g.items)
						)
					)
				: el('div', { class: 'muted' }, 'No activity yet.')
		),
		el(
			'div',
			{ class: 'tk-foot' },
			el('span', {}, 'Reporter ', el('span', { class: 'v' }, t.customer?.name ?? '—')),
			el('span', {}, 'Channel ', el('span', { class: 'v' }, channel)),
			el('span', {}, 'Created ', el('span', { class: 'mono v' }, fullDate(t.createdAt))),
			t.firstResponseAt
				? el(
						'span',
						{},
						'First response ',
						el('span', { class: 'mono v' }, fullDate(t.firstResponseAt))
					)
				: null,
			t.resolvedAt
				? el('span', {}, 'Resolved ', el('span', { class: 'mono v' }, fullDate(t.resolvedAt)))
				: null,
			el('span', {}, 'Updated ', el('span', { class: 'mono v' }, relative(t.updatedAt)))
		)
	];
	return nodes.filter((n): n is HTMLElement => n !== null);
}

function openButton(url: string): HTMLElement {
	const b = el(
		'button',
		{ type: 'button', class: 'btn' },
		'Open in trackr',
		icon('arrow-up-right', 14)
	);
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
