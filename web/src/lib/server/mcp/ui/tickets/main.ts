// Ticket table — the MCP App behind `list_tickets` (ui://trackr/tickets).
//
// Runs inside the host's sandboxed iframe. The host hands us the tool result
// (`ontoolresult`) whose `structuredContent` is the same JSON the tool returns
// to the model; we render it as a sortable, filterable table. A row click asks
// the host to open the ticket in trackr (`openLink`). Nothing here talks to
// trackr directly — every call goes through the host, as the same user.
//
// Built into a single HTML file by vite.mcp-ui.config.ts and served by
// $lib/server/mcp/ui as a resource; the server never renders it.

import { App } from '@modelcontextprotocol/ext-apps/app-with-deps';

type Ticket = {
	id: string;
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
	url: string;
};
type Payload = { total: number; tickets: Ticket[] };

// Mirrors TICKET_STATUSES / TICKET_PRIORITIES in src/lib/config/taxonomy.ts.
const STATUS: Record<string, { label: string; dot: string; tint: string }> = {
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
const STATUS_ORDER = Object.keys(STATUS);
const PRIORITY: Record<string, { label: string; bars: number; color: string }> = {
	low: { label: 'Low', bars: 1, color: '#7a9cf0' },
	medium: { label: 'Medium', bars: 2, color: '#f0a85c' },
	high: { label: 'High', bars: 3, color: '#ef7a6d' },
	urgent: { label: 'Urgent', bars: 4, color: '#ef4f5e' }
};

type Col = {
	id: keyof Ticket | 'assignees';
	label: string;
	sort: (a: Ticket, b: Ticket) => number;
};
const COLS: Col[] = [
	{ id: 'key', label: 'Key', sort: (a, b) => numberOf(a.key) - numberOf(b.key) },
	{ id: 'subject', label: 'Subject', sort: (a, b) => a.subject.localeCompare(b.subject) },
	{
		id: 'status',
		label: 'Status',
		sort: (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
	},
	{
		id: 'priority',
		label: 'Priority',
		sort: (a, b) => (PRIORITY[b.priority]?.bars ?? 0) - (PRIORITY[a.priority]?.bars ?? 0)
	},
	{ id: 'orgKey', label: 'Org', sort: (a, b) => a.orgKey.localeCompare(b.orgKey) },
	{
		id: 'assignees',
		label: 'Assignees',
		sort: (a, b) => names(a).localeCompare(names(b))
	},
	{
		id: 'lastActivityAt',
		label: 'Last activity',
		sort: (a, b) => (b.lastActivityAt ?? b.updatedAt).localeCompare(a.lastActivityAt ?? a.updatedAt)
	},
	{ id: 'messageCount', label: 'Msgs', sort: (a, b) => b.messageCount - a.messageCount }
];

const numberOf = (key: string) => Number(key.slice(key.lastIndexOf('-') + 1)) || 0;
const names = (t: Ticket) => t.assignees.map((a) => a.name).join(', ');

function relative(iso: string | null): string {
	if (!iso) return '—';
	const ms = Date.now() - new Date(iso).getTime();
	if (!Number.isFinite(ms)) return '—';
	const m = Math.round(ms / 60_000);
	if (m < 1) return 'now';
	if (m < 60) return `${m}m`;
	const h = Math.round(m / 60);
	if (h < 24) return `${h}h`;
	const d = Math.round(h / 24);
	if (d < 30) return `${d}d`;
	return new Date(iso).toLocaleDateString();
}

// ─── State ──────────────────────────────────────────────────────────────────

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const el = {
	q: $<HTMLInputElement>('q'),
	chips: $('chips'),
	count: $('count'),
	head: $('head'),
	rows: $('rows'),
	empty: $('empty'),
	error: $('error')
};

let all: Ticket[] = [];
let total = 0;
let query = '';
let statusFilter: string | null = null;
let sortCol = 'lastActivityAt';
let sortDir: 'asc' | 'desc' = 'asc'; // 'asc' = the column's natural order (newest first for dates)

function visible(): Ticket[] {
	const q = query.trim().toLowerCase();
	let rows = all.filter(
		(t) =>
			(!statusFilter || t.status === statusFilter) &&
			(!q ||
				t.key.toLowerCase().includes(q) ||
				t.subject.toLowerCase().includes(q) ||
				t.orgName.toLowerCase().includes(q) ||
				names(t).toLowerCase().includes(q) ||
				(t.customer?.name.toLowerCase().includes(q) ?? false))
	);
	const col = COLS.find((c) => c.id === sortCol) ?? COLS[6];
	rows = [...rows].sort(col.sort);
	if (sortDir === 'desc') rows.reverse();
	return rows;
}

// ─── Render ─────────────────────────────────────────────────────────────────

function renderHead() {
	el.head.replaceChildren(
		...COLS.map((c) => {
			const th = document.createElement('th');
			th.textContent = c.label;
			th.setAttribute(
				'aria-sort',
				c.id === sortCol ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
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
	const present = STATUS_ORDER.filter((s) => all.some((t) => t.status === s));
	el.chips.replaceChildren(
		...present.map((s) => {
			const meta = STATUS[s];
			const b = document.createElement('button');
			b.type = 'button';
			b.className = 'chip';
			b.style.setProperty('--dot', meta.dot);
			b.style.setProperty('--tint', meta.tint);
			b.setAttribute('aria-pressed', String(statusFilter === s));
			const dot = document.createElement('span');
			dot.className = 'dot';
			b.append(dot, `${meta.label} `, String(all.filter((t) => t.status === s).length));
			b.onclick = () => {
				statusFilter = statusFilter === s ? null : s;
				render();
			};
			return b;
		})
	);
}

function badge(status: string): HTMLElement {
	const meta = STATUS[status] ?? { label: status, dot: '#7c7c84', tint: 'rgba(124,124,132,0.14)' };
	const span = document.createElement('span');
	span.className = 'badge';
	span.style.setProperty('--dot', meta.dot);
	span.style.setProperty('--tint', meta.tint);
	const dot = document.createElement('span');
	dot.className = 'dot';
	span.append(dot, meta.label);
	return span;
}

function priority(p: string): HTMLElement {
	const meta = PRIORITY[p];
	const wrap = document.createElement('span');
	wrap.className = 'prio';
	wrap.title = meta?.label ?? 'None';
	wrap.style.setProperty('--color', meta?.color ?? '#5b5b62');
	for (let i = 1; i <= 4; i++) {
		const bar = document.createElement('i');
		if (meta && i <= meta.bars) bar.className = 'on';
		wrap.append(bar);
	}
	return wrap;
}

function td(child: string | Node, cls?: string): HTMLTableCellElement {
	const cell = document.createElement('td');
	if (cls) cell.className = cls;
	cell.append(child);
	return cell;
}

function render() {
	renderHead();
	renderChips();
	const rows = visible();
	el.rows.replaceChildren(
		...rows.map((t) => {
			const tr = document.createElement('tr');
			tr.title = `${t.key} — open in trackr`;
			tr.append(
				td(t.key, 'key'),
				td(t.subject, 'subject'),
				td(badge(t.status)),
				td(priority(t.priority)),
				td(t.orgName || t.orgKey, 'muted'),
				td(names(t) || '—', names(t) ? '' : 'muted'),
				td(relative(t.lastActivityAt ?? t.updatedAt), 'muted'),
				td(String(t.messageCount), 'muted')
			);
			tr.onclick = () => void open(t);
			return tr;
		})
	);
	el.empty.hidden = rows.length > 0;
	el.count.textContent =
		rows.length === all.length
			? `${all.length}${total > all.length ? ` of ${total}` : ''} tickets`
			: `${rows.length} of ${all.length}${total > all.length ? ` (${total} total)` : ''}`;
	queueMicrotask(reportSize);
}

// ─── Host bridge ────────────────────────────────────────────────────────────

const app = new App({ name: 'trackr-tickets', version: '1.0.0' });

async function open(t: Ticket) {
	try {
		await app.openLink({ url: t.url });
	} catch (err) {
		showError(`Could not open ${t.key}: ${(err as Error).message}`);
	}
}

function showError(msg: string) {
	el.error.textContent = msg;
	el.error.hidden = false;
}

function reportSize() {
	const height = Math.ceil(document.documentElement.getBoundingClientRect().height);
	void app.sendSizeChanged({ height }).catch(() => {});
}

function applyTheme(theme: string | undefined) {
	if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;
	else delete document.documentElement.dataset.theme;
}

function extractPayload(result: {
	structuredContent?: unknown;
	content?: unknown;
	isError?: boolean;
}): Payload | null {
	const sc = result.structuredContent as Partial<Payload> | undefined;
	if (sc && Array.isArray(sc.tickets))
		return { total: sc.total ?? sc.tickets.length, tickets: sc.tickets };
	// Fallback: some hosts only forward the text blocks — accept a JSON one.
	for (const block of (result.content as { type: string; text?: string }[]) ?? []) {
		if (block.type !== 'text' || !block.text) continue;
		try {
			const parsed = JSON.parse(block.text) as Partial<Payload>;
			if (Array.isArray(parsed.tickets))
				return { total: parsed.total ?? parsed.tickets.length, tickets: parsed.tickets };
		} catch {
			/* not JSON */
		}
	}
	return null;
}

app.ontoolresult = (result) => {
	if (result.isError) {
		showError(
			((result.content as { type: string; text?: string }[]) ?? [])
				.map((c) => c.text ?? '')
				.join('\n') || 'The tool call failed.'
		);
		return;
	}
	const payload = extractPayload(result);
	if (!payload) {
		showError('No ticket data in the tool result.');
		return;
	}
	el.error.hidden = true;
	all = payload.tickets;
	total = payload.total;
	render();
};

app.onhostcontextchanged = (ctx) => applyTheme(ctx.theme);

el.q.addEventListener('input', () => {
	query = el.q.value;
	render();
});
new ResizeObserver(reportSize).observe(document.documentElement);

app
	.connect()
	.then(() => applyTheme(app.getHostContext()?.theme))
	.catch((err: Error) => showError(`Could not connect to the host: ${err.message}`));
