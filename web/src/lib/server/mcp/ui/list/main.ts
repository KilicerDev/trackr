// List widget — the MCP App behind show_items (ui://trackr/list.html). The
// tool result's `structuredContent` carries any of `tasks` / `tickets` /
// `projects` (and `results`, kept for search-shaped payloads); every kind
// present renders, in that order. Rows look like the app's list views — tasks
// grouped under their project, tickets under their organization — with no
// toolbar: the model chose the items, so the widget just shows them. A row
// click asks the host to open the item in trackr.

import {
	badge,
	connectApp,
	el,
	openLink,
	payloadOf,
	priorityBars,
	relative,
	reportSize,
	type ToolResultLike
} from '../shared/host';
import { PRIORITY, PROJECT_STATUS, SEARCH_TYPE, statusMeta, TASK_TYPE } from '../shared/taxonomy';
import {
	avatar,
	avatarStack,
	dateShort,
	dueSignal,
	icon,
	taskStatusDot,
	ticketStatusDot,
	type Person
} from '../shared/ui';

type Row = Record<string, unknown> & { url?: string | null };
type GroupKey = { id: string; label: string; dot: string };
type Group = GroupKey & { rows: Row[] };
type Kind = {
	id: 'tickets' | 'tasks' | 'projects' | 'results';
	noun: string;
	/** Group rows under a header; null = one flat list. */
	group: ((r: Row) => GroupKey) | null;
	/** Header order; row order inside a group is the tool's. */
	sortGroups?: (a: Group, b: Group) => number;
	row: (r: Row) => HTMLElement;
};

const s = (v: unknown) => (typeof v === 'string' ? v : '');
const n = (v: unknown) => (typeof v === 'number' ? v : 0);
const people = (v: unknown): Person[] => (Array.isArray(v) ? (v as Person[]) : []);
const tags = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
const byLabel = (a: Group, b: Group) => a.label.localeCompare(b.label);

function keyCell(key: string) {
	return el('span', { class: 'key mono' }, key);
}

function tagsCell(list: string[]): HTMLElement | null {
	if (!list.length) return null;
	return el(
		'span',
		{ class: 'tags' },
		...list.slice(0, 3).map((t) => el('span', { class: 'tag' }, t))
	);
}

/** `3/7` with the checklist icon, green once everything is ticked. */
function checklistCell(summary: string): HTMLElement | null {
	const m = summary.match(/^(\d+)\/(\d+)$/);
	if (!m || m[2] === '0') return null;
	const done = m[1] === m[2];
	return el(
		'span',
		{ class: done ? 'sig ok' : 'sig', title: 'Checklist' },
		icon('check-square', 12),
		el('span', { class: 'mono num' }, summary)
	);
}

function priorityCell(priority: string): HTMLElement {
	const meta = PRIORITY[priority];
	if (!meta || meta.bars === 0) {
		return el('span', { class: 'priocell' }, el('span', { class: 'dash' }, '—'));
	}
	return el(
		'span',
		{ class: 'priocell' },
		priorityBars(priority),
		el('span', { class: 'plabel' }, meta.label)
	);
}

/** Due column: the countdown while it matters, the date otherwise. */
function dueCell(due: string, done: boolean): HTMLElement {
	if (!due) return el('span', { class: 'due mono' }, '—');
	const sig = done ? null : dueSignal(due);
	if (sig && sig.label)
		return el('span', { class: `due ${sig.tone}`, title: dateShort(due) }, sig.label);
	return el('span', { class: 'due mono' }, dateShort(due));
}

const KINDS: Record<Kind['id'], Kind> = {
	tasks: {
		id: 'tasks',
		noun: 'tasks',
		group: (r) => ({
			id: s(r.projectKey),
			label: s(r.projectName) || s(r.projectKey),
			dot: s(r.projectColor) || '#7a9cf0'
		}),
		sortGroups: byLabel,
		row: (r) => {
			const type = TASK_TYPE[s(r.type)] ?? TASK_TYPE.task;
			const assignees = people(r.assignees);
			return el(
				'div',
				{ class: 'row' },
				taskStatusDot(s(r.status)),
				keyCell(s(r.key)),
				el(
					'span',
					{ class: 'main' },
					el(
						'span',
						{ class: 'tbadge', title: type.label, '--color': type.color },
						icon(type.icon, 11, 2.2)
					),
					el('span', { class: 'title' }, s(r.title)),
					tagsCell(tags(r.tags)),
					checklistCell(s(r.checklist))
				),
				priorityCell(s(r.priority)),
				dueCell(s(r.due), s(r.status) === 'done'),
				el('span', { class: 'when mono' }, dateShort(s(r.updated))),
				el(
					'span',
					{ class: 'people' },
					assignees.length
						? avatar(assignees[0], 24)
						: el('span', { class: 'avatar-none', '--size': '22px' })
				)
			);
		}
	},
	tickets: {
		id: 'tickets',
		noun: 'tickets',
		group: (r) => ({
			id: s(r.orgKey),
			label: s(r.orgName) || s(r.orgKey),
			dot: s(r.orgColor) || '#7a9cf0'
		}),
		sortGroups: byLabel,
		row: (r) => {
			const msgs = n(r.messageCount);
			return el(
				'div',
				{ class: 'row' },
				priorityBars(s(r.priority)),
				keyCell(s(r.key)),
				ticketStatusDot(s(r.status)),
				el('span', { class: 'main' }, el('span', { class: 'title' }, s(r.subject))),
				msgs > 0
					? el(
							'span',
							{ class: 'sig hide-narrow' },
							icon('msg', 12),
							el('span', { class: 'num' }, String(msgs))
						)
					: null,
				el('span', { class: 'when' }, relative(s(r.lastActivityAt) || s(r.updatedAt))),
				el('span', { class: 'people wide' }, avatarStack(people(r.assignees), 22))
			);
		}
	},
	projects: {
		id: 'projects',
		noun: 'projects',
		group: null,
		row: (r) => {
			const count = r.taskCount == null ? null : n(r.taskCount);
			return el(
				'div',
				{ class: 'row' },
				el(
					'span',
					{ class: 'ptile', '--color': s(r.color) || '#7a9cf0' },
					s(r.icon) || s(r.key).slice(0, 1)
				),
				keyCell(s(r.key)),
				el(
					'span',
					{ class: 'main' },
					el('span', { class: 'title' }, s(r.name)),
					tagsCell(tags(r.tags))
				),
				badge(statusMeta(PROJECT_STATUS, s(r.status))),
				el(
					'span',
					{ class: 'orgchip', title: s(r.orgName) || 'Internal' },
					el('span', {}, s(r.orgName) || 'Internal')
				),
				el(
					'span',
					{ class: 'sig hide-narrow', title: 'Open tasks' },
					icon('check-square', 12),
					el('span', { class: 'num' }, count == null ? '—' : String(count))
				),
				el('span', { class: 'when mono' }, dateShort(s(r.updatedAt)))
			);
		}
	},
	results: {
		id: 'results',
		noun: 'results',
		group: (r) => {
			const meta = statusMeta(SEARCH_TYPE, s(r.type));
			return { id: s(r.type), label: meta.label + 's', dot: meta.dot };
		},
		sortGroups: (a, b) =>
			Object.keys(SEARCH_TYPE).indexOf(a.id) - Object.keys(SEARCH_TYPE).indexOf(b.id),
		row: (r) => {
			const type = s(r.type);
			const glyph =
				type === 'ticket'
					? 'ticket'
					: type === 'task'
						? 'square'
						: type === 'project'
							? 'folder'
							: type === 'wiki'
								? 'book'
								: 'file';
			const meta = statusMeta(SEARCH_TYPE, type);
			const subtitle = s(r.subtitle);
			return el(
				'div',
				{ class: 'row' },
				el('span', { class: 'tbadge', '--color': meta.dot }, icon(glyph, 11, 2.2)),
				keyCell(s(r.ref)),
				el(
					'span',
					{ class: 'main' },
					el('span', { class: 'title' }, s(r.title)),
					subtitle && subtitle !== s(r.ref) ? el('span', { class: 'sub' }, subtitle) : null
				)
			);
		}
	}
};

// ─── Render ─────────────────────────────────────────────────────────────────

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const dom = { groups: $('groups'), foot: $('foot'), empty: $('empty'), error: $('error') };

function showError(msg: string) {
	dom.error.textContent = msg;
	dom.error.hidden = false;
}

/** Groups of one kind; a flat kind gets a labelled group when it shares the widget with others. */
function groupRows(kind: Kind, rows: Row[], mixed: boolean): Group[] {
	if (!kind.group) {
		const label = mixed ? kind.noun[0].toUpperCase() + kind.noun.slice(1) : '';
		return [{ id: kind.id, label, dot: 'var(--text-3)', rows }];
	}
	const groups = new Map<string, Group>();
	for (const r of rows) {
		const key = kind.group(r);
		const g = groups.get(key.id) ?? { ...key, rows: [] };
		g.rows.push(r);
		groups.set(key.id, g);
	}
	const list = [...groups.values()];
	if (kind.sortGroups) list.sort(kind.sortGroups);
	return list;
}

function renderRow(kind: Kind, r: Row): HTMLElement {
	const row = kind.row(r);
	if (!r.url) return row;
	row.setAttribute('role', 'link');
	row.setAttribute('tabindex', '0');
	row.title = 'Open in trackr';
	const open = () =>
		openLink(r.url!).catch((err: Error) => showError(`Could not open: ${err.message}`));
	row.onclick = open;
	row.onkeydown = (e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			open();
		}
	};
	return row;
}

function renderGroup(kind: Kind, g: Group): HTMLElement {
	const rows = el('div', { class: 'rows' }, ...g.rows.map((r) => renderRow(kind, r)));
	const group = el('section', { class: 'group' });
	if (g.label) {
		const head = el(
			'button',
			{ type: 'button', class: 'ghead', 'aria-expanded': 'true', '--dot': g.dot },
			el('span', { class: 'chev' }, icon('chevron', 13)),
			el('span', { class: 'gdot' }),
			el('span', { class: 'glabel' }, g.label),
			el('span', { class: 'gcount mono' }, String(g.rows.length))
		);
		head.onclick = () => {
			const collapsed = group.toggleAttribute('data-collapsed');
			head.setAttribute('aria-expanded', String(!collapsed));
			queueMicrotask(reportSize);
		};
		group.append(head);
	}
	group.append(rows);
	return group;
}

function render(parts: { kind: Kind; rows: Row[] }[], total: number) {
	const mixed = parts.length > 1;
	const shown = parts.reduce((n, p) => n + p.rows.length, 0);
	dom.groups.replaceChildren(
		...parts.flatMap((p) => groupRows(p.kind, p.rows, mixed).map((g) => renderGroup(p.kind, g)))
	);
	dom.groups.hidden = shown === 0;
	dom.empty.hidden = shown > 0;
	const truncated = total > shown;
	const noun = mixed ? 'items' : (parts[0]?.kind.noun ?? 'items');
	dom.foot.textContent = truncated ? `Showing ${shown} of ${total} ${noun}.` : '';
	dom.foot.hidden = !truncated;
	queueMicrotask(reportSize);
}

function accept(result: ToolResultLike) {
	type Payload = { total?: number } & Partial<Record<Kind['id'], Row[]>>;
	const ids = ['tasks', 'tickets', 'projects', 'results'] as const;
	const payload = payloadOf<Payload>(result, (v) => ids.some((k) => Array.isArray(v[k])));
	if (!payload) {
		showError('No list data in the tool result.');
		return;
	}
	const parts = ids
		.filter((k) => Array.isArray(payload[k]) && payload[k]!.length > 0)
		.map((k) => ({ kind: KINDS[k], rows: payload[k]! }));
	dom.error.hidden = true;
	render(parts, payload.total ?? parts.reduce((n, p) => n + p.rows.length, 0));
}

connectApp({ name: 'trackr-list', onResult: accept, onError: showError });
