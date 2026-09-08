// Presentational helpers the widgets share: inline SVG icons (a hand-picked
// subset of lucide, the icon set the app uses), avatars that hash the same
// way as the app's layout, and the short date / due-countdown formats of
// the tasks list. Dependency-free — this is bundled into the iframe.

import { el } from './host';
import { TASK_STATUS, TICKET_STATUS, type StatusMeta } from './taxonomy';

type IconNode = [tag: string, attrs: Record<string, string>][];

// lucide v1.16 icon nodes (ISC). Keep in sync with src/lib/components/Icon.svelte.
const ICONS: Record<string, IconNode> = {
	square: [['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2' }]],
	bug: [
		['path', { d: 'M12 20v-9' }],
		['path', { d: 'M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4z' }],
		['path', { d: 'M14.12 3.88 16 2' }],
		['path', { d: 'M21 21a4 4 0 0 0-3.81-4' }],
		['path', { d: 'M21 5a4 4 0 0 1-3.55 3.97' }],
		['path', { d: 'M22 13h-4' }],
		['path', { d: 'M3 21a4 4 0 0 1 3.81-4' }],
		['path', { d: 'M3 5a4 4 0 0 0 3.55 3.97' }],
		['path', { d: 'M6 13H2' }],
		['path', { d: 'm8 2 1.88 1.88' }],
		['path', { d: 'M9 7.13V6a3 3 0 1 1 6 0v1.13' }]
	],
	triangle: [
		['path', { d: 'M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z' }]
	],
	sparkles: [
		[
			'path',
			{
				d: 'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z'
			}
		],
		['path', { d: 'M20 2v4' }],
		['path', { d: 'M22 4h-4' }],
		['circle', { cx: '4', cy: '20', r: '2' }]
	],
	settings: [
		[
			'path',
			{
				d: 'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915'
			}
		],
		['circle', { cx: '12', cy: '12', r: '3' }]
	],
	chevron: [['path', { d: 'm6 9 6 6 6-6' }]],
	'arrow-up-right': [
		['path', { d: 'M7 7h10v10' }],
		['path', { d: 'M7 17 17 7' }]
	],
	paperclip: [
		[
			'path',
			{
				d: 'm16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551'
			}
		]
	],
	user: [
		['path', { d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' }],
		['circle', { cx: '12', cy: '7', r: '4' }]
	],
	'check-square': [
		['path', { d: 'M21 10.656V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.344' }],
		['path', { d: 'm9 11 3 3L22 4' }]
	],
	check: [['path', { d: 'M20 6 9 17l-5-5' }]],
	calendar: [
		['path', { d: 'M8 2v4' }],
		['path', { d: 'M16 2v4' }],
		['rect', { width: '18', height: '18', x: '3', y: '4', rx: '2' }],
		['path', { d: 'M3 10h18' }]
	],
	msg: [
		[
			'path',
			{
				d: 'M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z'
			}
		]
	],
	ticket: [
		[
			'path',
			{
				d: 'M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z'
			}
		],
		['path', { d: 'M13 5v2' }],
		['path', { d: 'M13 17v2' }],
		['path', { d: 'M13 11v2' }]
	],
	folder: [
		[
			'path',
			{
				d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'
			}
		]
	],
	book: [
		[
			'path',
			{
				d: 'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20'
			}
		]
	],
	file: [
		[
			'path',
			{
				d: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z'
			}
		],
		['path', { d: 'M14 2v5a1 1 0 0 0 1 1h5' }],
		['path', { d: 'M10 9H8' }],
		['path', { d: 'M16 13H8' }],
		['path', { d: 'M16 17H8' }]
	]
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Inline lucide icon; `currentColor` stroke, so colour it via CSS. */
export function icon(name: string, size = 14, stroke = 2): SVGSVGElement {
	const svg = document.createElementNS(SVG_NS, 'svg');
	svg.setAttribute('width', String(size));
	svg.setAttribute('height', String(size));
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('fill', 'none');
	svg.setAttribute('stroke', 'currentColor');
	svg.setAttribute('stroke-width', String(stroke));
	svg.setAttribute('stroke-linecap', 'round');
	svg.setAttribute('stroke-linejoin', 'round');
	svg.setAttribute('aria-hidden', 'true');
	svg.classList.add('icon');
	for (const [tag, attrs] of ICONS[name] ?? ICONS.square) {
		const node = document.createElementNS(SVG_NS, tag);
		for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
		svg.append(node);
	}
	return svg;
}

// ─── People ─────────────────────────────────────────────────────────────────

export type Person = { id: string; name: string };

// Same derivation as src/routes/(app)/+layout.server.ts, so a person gets the
// same colour and initials here as in the app.
export function initials(name: string): string {
	return name
		.split(/\s+/)
		.map((p) => p[0])
		.filter(Boolean)
		.slice(0, 2)
		.join('')
		.toUpperCase();
}

export function userColor(id: string): string {
	let h = 0;
	for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
	return `hsl(${h % 360} 55% 60%)`;
}

export function avatar(p: Person, size = 24): HTMLElement {
	return el(
		'span',
		{
			class: 'avatar',
			title: p.name,
			'--size': `${size}px`,
			'--color': userColor(p.id)
		},
		initials(p.name) || '?'
	);
}

/** Up to `max` overlapping avatars, then a "+n" bubble; a dashed ring when nobody. */
export function avatarStack(people: Person[], size = 22, max = 3): HTMLElement {
	if (!people.length) return el('span', { class: 'avatar-none', '--size': `${size}px` });
	const shown = people.slice(0, max);
	const rest = people.length - shown.length;
	return el(
		'span',
		{ class: 'avatars', title: people.map((p) => p.name).join(', ') },
		...shown.map((p) => avatar(p, size)),
		rest > 0 ? el('span', { class: 'avatar more', '--size': `${size}px` }, `+${rest}`) : null
	);
}

// ─── Status dots ────────────────────────────────────────────────────────────

/** The tasks list's status marker: a ring in the status colour, filled as work progresses. */
export function taskStatusDot(status: string): HTMLElement {
	const meta = TASK_STATUS[status];
	const fill = status === 'done' ? 'full' : status === 'in_progress' ? 'half' : 'none';
	return el('span', {
		class: `sdot ${fill}`,
		title: meta?.label ?? status,
		'--dot': meta?.dot ?? '#7c7c84'
	});
}

export function ticketStatusDot(status: string): HTMLElement {
	const meta: StatusMeta | undefined = TICKET_STATUS[status];
	return el('span', { class: 'sdot full small', title: meta?.label ?? status, '--dot': meta?.dot });
}

// ─── Dates ──────────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `7 Sep`, like the app's list columns. */
export function dateShort(iso: string | null | undefined): string {
	if (!iso) return '';
	const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (!m) return iso;
	return `${parseInt(m[3])} ${MONTHS[parseInt(m[2]) - 1]}`;
}

export type DueTone = 'overdue' | 'urgent' | 'soon' | 'normal';

/** Mirrors dueCountdown in src/lib/utils/format.ts. Empty label = just show the date. */
export function dueSignal(iso: string | null | undefined): { label: string; tone: DueTone } | null {
	if (!iso) return null;
	const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (!m) return null;
	const due = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
	if (days < 0) return { label: 'Overdue', tone: 'overdue' };
	if (days === 0) return { label: 'Today', tone: 'urgent' };
	if (days === 1) return { label: '1 day left', tone: 'urgent' };
	if (days <= 3) return { label: `${days} days left`, tone: 'urgent' };
	if (days <= 7) return { label: `${days} days left`, tone: 'soon' };
	return { label: '', tone: 'normal' };
}
