// List widget — the MCP App behind list_tickets, list_tasks, list_projects and
// search (ui://trackr/list.html). The tool result's `structuredContent` tells
// us which kind we got (`tickets` / `tasks` / `projects` / `results`); each
// kind has its own columns, chips and sort rules. A row click asks the host to
// open the item in trackr.

import {
	badge,
	callTool,
	connectApp,
	el,
	openLink,
	payloadOf,
	priorityBars,
	relative,
	reportSize,
	type ToolResultLike
} from '../shared/host';
import {
	PRIORITY,
	PROJECT_STATUS,
	SEARCH_TYPE,
	statusMeta,
	TASK_STATUS,
	TASK_TYPE,
	TICKET_STATUS,
	type StatusMeta
} from '../shared/taxonomy';

void callTool; // (kept for parity with the detail widget's host API surface)

type Person = { id: string; name: string };
type Row = Record<string, unknown> & { url?: string | null };
type Column = {
	id: string;
	label: string;
	grow?: boolean;
	cell: (r: Row) => Node | string;
	sort: (a: Row, b: Row) => number;
	/** Newest / highest first is the natural order for these. */
	descFirst?: boolean;
};
type Kind = {
	id: 'tickets' | 'tasks' | 'projects' | 'results';
	noun: string;
	columns: Column[];
	/** Field + metadata map for the toolbar chips. */
	chips: { field: string; meta: Record<string, StatusMeta>; order: string[] } | null;
	searchable: (r: Row) => string;
	defaultSort: string;
};

const s = (v: unknown) => (typeof v === 'string' ? v : '');
const n = (v: unknown) => (typeof v === 'number' ? v : 0);
const people = (v: unknown) =>
	Array.isArray(v) ? (v as Person[]).map((p) => p.name).join(', ') : '';
const keyNumber = (key: string) => Number(key.slice(key.lastIndexOf('-') + 1)) || 0;
const str = (f: string) => (a: Row, b: Row) => s(a[f]).localeCompare(s(b[f]));
const byKey = (a: Row, b: Row) =>
	s(a.key).replace(/-\d+$/, '').localeCompare(s(b.key).replace(/-\d+$/, '')) ||
	keyNumber(s(a.key)) - keyNumber(s(b.key));
const byDate = (f: string, fallback?: string) => (a: Row, b: Row) =>
	s(b[f] ?? (fallback ? b[fallback] : '')).localeCompare(s(a[f] ?? (fallback ? a[fallback] : '')));
const byStatus = (map: Record<string, StatusMeta>) => (a: Row, b: Row) =>
	Object.keys(map).indexOf(s(a.status)) - Object.keys(map).indexOf(s(b.status));
const byPriority = (a: Row, b: Row) =>
	(PRIORITY[s(b.priority)]?.bars ?? 0) - (PRIORITY[s(a.priority)]?.bars ?? 0);

function tagsCell(v: unknown): Node | string {
	const tags = Array.isArray(v) ? (v as string[]) : [];
	if (!tags.length) return '—';
	return el(
		'span',
		{ class: 'tags' },
		...tags.slice(0, 3).map((t) => el('span', { class: 'tag' }, t))
	);
}

const KINDS: Record<Kind['id'], Kind> = {
	tickets: {
		id: 'tickets',
		noun: 'tickets',
		defaultSort: 'lastActivityAt',
		chips: { field: 'status', meta: TICKET_STATUS, order: Object.keys(TICKET_STATUS) },
		searchable: (r) =>
			`${s(r.key)} ${s(r.subject)} ${s(r.orgName)} ${people(r.assignees)} ${(r.customer as Person | null)?.name ?? ''}`,
		columns: [
			{
				id: 'key',
				label: 'Key',
				cell: (r) => el('span', { class: 'mono muted' }, s(r.key)),
				sort: byKey
			},
			{
				id: 'subject',
				label: 'Subject',
				grow: true,
				cell: (r) => s(r.subject),
				sort: str('subject')
			},
			{
				id: 'status',
				label: 'Status',
				cell: (r) => badge(statusMeta(TICKET_STATUS, s(r.status))),
				sort: byStatus(TICKET_STATUS)
			},
			{
				id: 'priority',
				label: 'Priority',
				cell: (r) => priorityBars(s(r.priority)),
				sort: byPriority
			},
			{
				id: 'orgName',
				label: 'Org',
				cell: (r) => el('span', { class: 'muted' }, s(r.orgName) || s(r.orgKey)),
				sort: str('orgKey')
			},
			{
				id: 'assignees',
				label: 'Assignees',
				cell: (r) => people(r.assignees) || el('span', { class: 'muted' }, '—'),
				sort: (a, b) => people(a.assignees).localeCompare(people(b.assignees))
			},
			{
				id: 'lastActivityAt',
				label: 'Activity',
				cell: (r) =>
					el('span', { class: 'muted' }, relative(s(r.lastActivityAt) || s(r.updatedAt))),
				sort: byDate('lastActivityAt', 'updatedAt')
			},
			{
				id: 'messageCount',
				label: 'Msgs',
				cell: (r) => el('span', { class: 'muted' }, String(n(r.messageCount))),
				sort: (a, b) => n(b.messageCount) - n(a.messageCount)
			}
		]
	},
	tasks: {
		id: 'tasks',
		noun: 'tasks',
		defaultSort: 'updated',
		chips: { field: 'status', meta: TASK_STATUS, order: Object.keys(TASK_STATUS) },
		searchable: (r) =>
			`${s(r.key)} ${s(r.title)} ${s(r.projectKey)} ${people(r.assignees)} ${(r.tags as string[] | undefined)?.join(' ') ?? ''}`,
		columns: [
			{
				id: 'key',
				label: 'Key',
				cell: (r) => el('span', { class: 'mono muted' }, s(r.key)),
				sort: byKey
			},
			{
				id: 'title',
				label: 'Title',
				grow: true,
				cell: (r) => {
					const type = TASK_TYPE[s(r.type)];
					const checklist = s(r.checklist);
					const tags = Array.isArray(r.tags) ? (r.tags as string[]) : [];
					const sub = [
						type && type.label !== 'Task' ? type.label : null,
						checklist && checklist !== '0/0' ? `checklist ${checklist}` : null,
						tags.length ? tags.map((t) => `#${t}`).join(' ') : null
					]
						.filter(Boolean)
						.join(' · ');
					return el('span', {}, s(r.title), sub ? el('span', { class: 'sub' }, sub) : null);
				},
				sort: str('title')
			},
			{
				id: 'status',
				label: 'Status',
				cell: (r) => badge(statusMeta(TASK_STATUS, s(r.status))),
				sort: byStatus(TASK_STATUS)
			},
			{
				id: 'priority',
				label: 'Priority',
				cell: (r) => priorityBars(s(r.priority)),
				sort: byPriority
			},
			{
				id: 'projectKey',
				label: 'Project',
				cell: (r) => el('span', { class: 'muted' }, s(r.projectKey)),
				sort: str('projectKey')
			},
			{
				id: 'assignees',
				label: 'Assignees',
				cell: (r) => people(r.assignees) || el('span', { class: 'muted' }, '—'),
				sort: (a, b) => people(a.assignees).localeCompare(people(b.assignees))
			},
			{
				id: 'due',
				label: 'Due',
				cell: (r) => el('span', { class: 'muted' }, s(r.due) ? s(r.due).slice(0, 10) : '—'),
				sort: (a, b) => (s(a.due) || '9999').localeCompare(s(b.due) || '9999')
			},
			{
				id: 'updated',
				label: 'Updated',
				cell: (r) => el('span', { class: 'muted' }, relative(s(r.updated))),
				sort: byDate('updated')
			}
		]
	},
	projects: {
		id: 'projects',
		noun: 'projects',
		defaultSort: 'key',
		chips: { field: 'status', meta: PROJECT_STATUS, order: Object.keys(PROJECT_STATUS) },
		searchable: (r) =>
			`${s(r.key)} ${s(r.name)} ${s(r.orgName)} ${(r.tags as string[] | undefined)?.join(' ') ?? ''}`,
		columns: [
			{
				id: 'key',
				label: 'Key',
				cell: (r) => el('span', { class: 'mono muted' }, s(r.key)),
				sort: str('key')
			},
			{ id: 'name', label: 'Project', grow: true, cell: (r) => s(r.name), sort: str('name') },
			{
				id: 'status',
				label: 'Status',
				cell: (r) => badge(statusMeta(PROJECT_STATUS, s(r.status))),
				sort: byStatus(PROJECT_STATUS)
			},
			{
				id: 'orgName',
				label: 'Org',
				cell: (r) => el('span', { class: 'muted' }, s(r.orgName) || 'internal'),
				sort: str('orgName')
			},
			{
				id: 'tags',
				label: 'Tags',
				cell: (r) => tagsCell(r.tags),
				sort: (a, b) =>
					((a.tags as string[]) ?? []).join().localeCompare(((b.tags as string[]) ?? []).join())
			},
			{
				id: 'taskCount',
				label: 'Tasks',
				cell: (r) =>
					el('span', { class: 'muted' }, r.taskCount == null ? '—' : String(n(r.taskCount))),
				sort: (a, b) => n(b.taskCount) - n(a.taskCount)
			},
			{
				id: 'updatedAt',
				label: 'Updated',
				cell: (r) => el('span', { class: 'muted' }, relative(s(r.updatedAt))),
				sort: byDate('updatedAt')
			}
		]
	},
	results: {
		id: 'results',
		noun: 'results',
		defaultSort: 'type',
		chips: { field: 'type', meta: SEARCH_TYPE, order: Object.keys(SEARCH_TYPE) },
		searchable: (r) => `${s(r.ref)} ${s(r.title)} ${s(r.subtitle)}`,
		columns: [
			{
				id: 'type',
				label: 'Type',
				cell: (r) => badge(statusMeta(SEARCH_TYPE, s(r.type))),
				sort: byStatus(SEARCH_TYPE)
			},
			{
				id: 'ref',
				label: 'Ref',
				cell: (r) => el('span', { class: 'mono muted' }, s(r.ref)),
				sort: byKey
			},
			{
				id: 'title',
				label: 'Title',
				grow: true,
				cell: (r) =>
					el(
						'span',
						{},
						s(r.title),
						s(r.subtitle) && s(r.subtitle) !== s(r.ref)
							? el('span', { class: 'sub' }, s(r.subtitle))
							: null
					),
				sort: str('title')
			}
		]
	}
};

// ─── State ──────────────────────────────────────────────────────────────────

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const dom = {
	q: $<HTMLInputElement>('q'),
	chips: $('chips'),
	count: $('count'),
	head: $('head'),
	rows: $('rows'),
	empty: $('empty'),
	error: $('error')
};

let kind: Kind = KINDS.tickets;
let all: Row[] = [];
let total = 0;
let query = '';
let chip: string | null = null;
let sortCol = kind.defaultSort;
let sortDir: 'asc' | 'desc' = 'asc';

function showError(msg: string) {
	dom.error.textContent = msg;
	dom.error.hidden = false;
}

function visible(): Row[] {
	const q = query.trim().toLowerCase();
	let rows = all.filter(
		(r) =>
			(!chip || s(r[kind.chips!.field]) === chip) &&
			(!q || kind.searchable(r).toLowerCase().includes(q))
	);
	const col = kind.columns.find((c) => c.id === sortCol) ?? kind.columns[0];
	rows = [...rows].sort(col.sort);
	if (sortDir === 'desc') rows.reverse();
	return rows;
}

function renderHead() {
	dom.head.replaceChildren(
		...kind.columns.map((c) => {
			const th = el(
				'th',
				{
					'aria-sort': c.id === sortCol ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
				},
				c.label
			);
			th.onclick = () => {
				if (sortCol === c.id) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
				else {
					sortCol = c.id;
					sortDir = 'asc';
				}
				render();
			};
			return th;
		})
	);
}

function renderChips() {
	if (!kind.chips) {
		dom.chips.replaceChildren();
		return;
	}
	const { field, meta, order } = kind.chips;
	const present = order.filter((v) => all.some((r) => s(r[field]) === v));
	dom.chips.replaceChildren(
		...present.map((v) => {
			const m = statusMeta(meta, v);
			const b = el(
				'button',
				{
					type: 'button',
					class: 'chip',
					'--dot': m.dot,
					'--tint': m.tint,
					'aria-pressed': String(chip === v)
				},
				el('span', { class: 'dot' }),
				`${m.label} `,
				String(all.filter((r) => s(r[field]) === v).length)
			);
			b.onclick = () => {
				chip = chip === v ? null : v;
				render();
			};
			return b;
		})
	);
}

function render() {
	renderHead();
	renderChips();
	const rows = visible();
	dom.rows.replaceChildren(
		...rows.map((r) => {
			const tr = el('tr', { title: r.url ? 'Open in trackr' : undefined });
			for (const c of kind.columns)
				tr.append(el('td', { class: c.grow ? 'grow' : undefined }, c.cell(r)));
			tr.onclick = () => {
				if (!r.url) return;
				openLink(r.url).catch((err: Error) => showError(`Could not open: ${err.message}`));
			};
			return tr;
		})
	);
	dom.empty.hidden = rows.length > 0;
	const shown = rows.length === all.length ? `${all.length}` : `${rows.length} of ${all.length}`;
	dom.count.textContent = `${shown}${total > all.length ? ` (${total} total)` : ''} ${kind.noun}`;
	queueMicrotask(reportSize);
}

function accept(result: ToolResultLike) {
	type Payload = { total?: number } & Partial<Record<Kind['id'], Row[]>>;
	const payload = payloadOf<Payload>(result, (v) =>
		(['tickets', 'tasks', 'projects', 'results'] as const).some((k) => Array.isArray(v[k]))
	);
	if (!payload) {
		showError('No list data in the tool result.');
		return;
	}
	const id = (['tickets', 'tasks', 'projects', 'results'] as const).find((k) =>
		Array.isArray(payload[k])
	)!;
	kind = KINDS[id];
	all = payload[id] ?? [];
	total = payload.total ?? all.length;
	sortCol = kind.defaultSort;
	sortDir = 'asc';
	chip = null;
	dom.q.placeholder = `Filter ${kind.noun}…`;
	dom.error.hidden = true;
	render();
}

dom.q.addEventListener('input', () => {
	query = dom.q.value;
	render();
});

connectApp({ name: 'trackr-list', onResult: accept, onError: showError });
