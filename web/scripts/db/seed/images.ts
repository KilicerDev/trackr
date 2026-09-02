// Generated demo files for attachments. Everything is rendered from SVG via
// sharp at seed time (no binary fixtures checked in): fake screenshots, a
// chart, a phone mock, a "whiteboard photo", plus a couple of non-image files
// so the attachment list shows mixed types.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { esc } from './util';

export type DemoFile = { filename: string; mimeType: string; bytes: Buffer };

const FONT = 'Helvetica, Arial, sans-serif';
const BG = '#17171c';
const PANEL = '#202027';
const BORDER = '#2c2c34';
const TEXT = '#e8e8ec';
const MUTED = '#8a8a94';
const ACCENT = '#e07a5f';

function svgToPng(svg: string): Promise<Buffer> {
	return sharp(Buffer.from(svg)).png({ compressionLevel: 8 }).toBuffer();
}
function svgToJpeg(svg: string): Promise<Buffer> {
	return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
}

const text = (
	x: number,
	y: number,
	s: string,
	opts: { size?: number; fill?: string; weight?: number; anchor?: string; family?: string } = {}
) =>
	`<text x="${x}" y="${y}" font-family="${opts.family ?? FONT}" font-size="${opts.size ?? 16}" font-weight="${opts.weight ?? 400}" fill="${opts.fill ?? TEXT}" text-anchor="${opts.anchor ?? 'start'}">${esc(s)}</text>`;

const rect = (x: number, y: number, w: number, h: number, fill: string, r = 6, stroke?: string) =>
	`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"${stroke ? ` stroke="${stroke}"` : ''}/>`;

/** Browser-window chrome around a page body. */
function browserFrame(w: number, h: number, url: string, body: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
	${rect(0, 0, w, h, BG, 0)}
	${rect(0, 0, w, 56, PANEL, 0)}
	<circle cx="24" cy="28" r="6" fill="#ef5f5f"/><circle cx="44" cy="28" r="6" fill="#f0b64f"/><circle cx="64" cy="28" r="6" fill="#5fc97a"/>
	${rect(100, 16, w - 200, 24, BG, 12)}
	${text(w / 2, 33, url, { size: 13, fill: MUTED, anchor: 'middle' })}
	${body}
	</svg>`;
}

function checkoutError(): Promise<Buffer> {
	const w = 1280,
		h = 800;
	const body = `
	${rect(0, 56, w, 60, PANEL, 0)}
	${text(40, 94, 'Siweb Marketplace', { size: 20, weight: 700 })}
	${text(w - 40, 94, 'Cart (3)  ·  Renée C.', { size: 14, fill: MUTED, anchor: 'end' })}
	${rect(40, 150, w - 80, 72, '#3a1d1d', 10, '#ef5f5f')}
	<circle cx="76" cy="186" r="14" fill="#ef5f5f"/>${text(76, 192, '!', { size: 20, weight: 700, anchor: 'middle' })}
	${text(104, 180, 'Payment could not be processed', { size: 18, weight: 700, fill: '#ffb4b4' })}
	${text(104, 204, 'Error 502 from payment gateway (ref. PG-88213). Your card was not charged.', { size: 14, fill: '#e8a0a0' })}
	${rect(40, 250, 760, 480, PANEL, 12, BORDER)}
	${text(64, 290, 'Order summary', { size: 18, weight: 700 })}
	${[
		['Hydraulic pump HP-220', '2 ×', '€ 1.240,00'],
		['Seal kit SK-19 (Tetra Pak 90210-4411)', '1 ×', '€ 86,50'],
		['Bearing 6204-2RS', '12 ×', '€ 94,80']
	]
		.map(
			([n, q, p], i) => `
		${rect(64, 316 + i * 64, 712, 1, BORDER, 0)}
		${text(64, 352 + i * 64, n, { size: 15 })}
		${text(600, 352 + i * 64, q, { size: 14, fill: MUTED, anchor: 'end' })}
		${text(776, 352 + i * 64, p, { size: 15, weight: 600, anchor: 'end' })}`
		)
		.join('')}
	${rect(64, 560, 712, 1, BORDER, 0)}
	${text(64, 600, 'Total (excl. VAT)', { size: 16, fill: MUTED })}
	${text(776, 600, '€ 1.421,30', { size: 22, weight: 700, anchor: 'end' })}
	${rect(64, 650, 712, 52, '#3a3a44', 10)}
	${text(420, 683, 'Retry payment', { size: 16, weight: 600, anchor: 'middle', fill: MUTED })}
	${rect(840, 250, 400, 220, PANEL, 12, BORDER)}
	${text(864, 290, 'Payment method', { size: 16, weight: 700 })}
	${rect(864, 312, 352, 44, BG, 8, BORDER)}${text(880, 340, 'VISA •••• 4421', { size: 14 })}
	${rect(864, 368, 352, 44, BG, 8, BORDER)}${text(880, 396, 'Exp. 08/28', { size: 14, fill: MUTED })}
	${text(864, 446, 'Console: POST /api/checkout → 502', { size: 12, fill: '#ef5f5f', family: 'Menlo, monospace' })}`;
	return svgToPng(browserFrame(w, h, 'https://shop.siweb.de/checkout', body));
}

function skuSearch(): Promise<Buffer> {
	const w = 1280,
		h = 720;
	const rows = [
		['SKU-10442', 'Hydraulic pump HP-220', 'Published', '14', false],
		['SKU-10442', 'Hydraulic pump HP-220', 'Published', '14', true],
		['SKU-10443', 'Hydraulic pump HP-220 (refurb.)', 'Draft', '0', false],
		['SKU-10981', 'Seal kit SK-19', 'Published', '212', false],
		['SKU-10981', 'Seal kit SK-19', 'Published', '212', true],
		['SKU-11004', 'Bearing 6204-2RS', 'Deleted', '—', false]
	] as const;
	const body = `
	${rect(40, 90, w - 80, 48, PANEL, 10, BORDER)}
	${text(64, 120, '🔍  HP-220', { size: 16 })}
	${text(w - 64, 120, '6 results  ·  expected 4', { size: 14, fill: '#f0b64f', anchor: 'end' })}
	${rect(40, 160, w - 80, 500, PANEL, 12, BORDER)}
	${text(64, 196, 'SKU', { size: 12, fill: MUTED, weight: 700 })}
	${text(260, 196, 'Article', { size: 12, fill: MUTED, weight: 700 })}
	${text(780, 196, 'Status', { size: 12, fill: MUTED, weight: 700 })}
	${text(1000, 196, 'Stock', { size: 12, fill: MUTED, weight: 700 })}
	${rows
		.map(
			([sku, name, status, stock, dup], i) => `
		${dup ? rect(48, 216 + i * 70, w - 96, 62, '#3a2a1d', 8, '#f0b64f') : rect(64, 216 + i * 70, w - 128, 1, BORDER, 0)}
		${text(64, 254 + i * 70, sku, { size: 15, family: 'Menlo, monospace', fill: dup ? '#f0b64f' : TEXT })}
		${text(260, 254 + i * 70, name, { size: 15 })}
		${rect(780, 236 + i * 70, 96, 26, status === 'Published' ? '#1f3a2c' : status === 'Draft' ? '#2c2c34' : '#3a1d1d', 13)}
		${text(828, 254 + i * 70, status, { size: 12, anchor: 'middle', fill: status === 'Published' ? '#7fc8a9' : status === 'Draft' ? MUTED : '#ef7a6d' })}
		${text(1000, 254 + i * 70, stock, { size: 15, fill: MUTED })}
		${dup ? text(w - 72, 254 + i * 70, 'duplicate row', { size: 12, fill: '#f0b64f', anchor: 'end' }) : ''}`
		)
		.join('')}`;
	return svgToPng(browserFrame(w, h, 'https://shop.siweb.de/admin/articles?q=HP-220', body));
}

function dashboard(): Promise<Buffer> {
	const w = 1400,
		h = 860;
	const bars = [42, 58, 51, 73, 66, 81, 77, 92, 88, 104, 97, 118];
	const months = [
		'Sep',
		'Oct',
		'Nov',
		'Dec',
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'May',
		'Jun',
		'Jul',
		'Aug'
	];
	const stats = [
		['Open tickets', '23', '+4 this week', '#7a9cf0'],
		['Median first response', '1h 42m', '−18% vs. last month', '#7fc8a9'],
		['Tasks done (30d)', '118', '+12%', '#e07a5f'],
		['Hours logged (30d)', '312 h', '6 people', '#c08bd6']
	];
	const chart = bars
		.map((v, i) => {
			const x = 120 + i * 96;
			const bh = v * 3.2;
			return `${rect(x, 760 - bh, 56, bh, i === bars.length - 1 ? ACCENT : '#3f4c6e', 6)}${text(x + 28, 785, months[i], { size: 13, fill: MUTED, anchor: 'middle' })}${text(x + 28, 748 - bh, String(v), { size: 12, fill: MUTED, anchor: 'middle' })}`;
		})
		.join('');
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
	${rect(0, 0, w, h, BG, 0)}
	${text(48, 64, 'Support & delivery — dashboard v2', { size: 26, weight: 700 })}
	${text(48, 92, 'Draft for the client-facing report. Numbers are last 12 months.', { size: 14, fill: MUTED })}
	${stats
		.map(
			([label, value, delta, color], i) => `
		${rect(48 + i * 332, 120, 308, 130, PANEL, 14, BORDER)}
		${rect(48 + i * 332, 120, 6, 130, color, 3)}
		${text(76 + i * 332, 156, label, { size: 13, fill: MUTED, weight: 600 })}
		${text(76 + i * 332, 204, value, { size: 34, weight: 700 })}
		${text(76 + i * 332, 232, delta, { size: 13, fill: color })}`
		)
		.join('')}
	${rect(48, 290, w - 96, 530, PANEL, 14, BORDER)}
	${text(76, 326, 'Tasks completed per month', { size: 16, weight: 700 })}
	${[0, 1, 2, 3].map((i) => rect(120, 760 - i * 100, 1160, 1, BORDER, 0)).join('')}
	${chart}
	</svg>`;
	return svgToPng(svg);
}

function phoneMock(): Promise<Buffer> {
	const w = 780,
		h = 1560;
	const rows = [
		['MOBILE-14', 'Live Activity for running work session', 'In Progress', '#f0a85c'],
		['MOBILE-9', 'Offline snapshot store for tasks', 'In Review', '#b591e3'],
		['TRACKR-70', 'Inline edit task title from list view', 'Todo', '#9aa4b2'],
		['SIWEB-52', 'Checkout: retry payment fails silently', 'In Progress', '#f0a85c'],
		['SIWEB-31', 'Sticky table headers on long lists', 'Todo', '#9aa4b2'],
		['WEBIM-7', 'Landing hero copy — A/B variants', 'In Review', '#b591e3']
	];
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
	${rect(0, 0, w, h, '#0c0c0f', 0)}
	${rect(40, 40, w - 80, h - 80, BG, 90, '#3a3a44')}
	${rect(280, 70, 220, 44, '#0c0c0f', 22)}
	${text(100, 200, 'My Week', { size: 40, weight: 800 })}
	${text(100, 236, 'Wed · 7 tasks planned', { size: 18, fill: MUTED })}
	${['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
		.map(
			(d, i) => `
		${rect(100 + i * 118, 270, 100, 64, i === 2 ? ACCENT : PANEL, 16)}
		${text(150 + i * 118, 296, d, { size: 14, fill: i === 2 ? '#fff' : MUTED, anchor: 'middle' })}
		${text(150 + i * 118, 322, String(i + 1), { size: 20, weight: 700, anchor: 'middle', fill: i === 2 ? '#fff' : TEXT })}`
		)
		.join('')}
	${rows
		.map(
			([ref, title, status, color], i) => `
		${rect(100, 380 + i * 150, w - 200, 128, PANEL, 20, BORDER)}
		${text(128, 420 + i * 150, ref, { size: 14, fill: MUTED, family: 'Menlo, monospace' })}
		${text(128, 456 + i * 150, title, { size: 19, weight: 600 })}
		<circle cx="136" cy="486${i * 150 ? '' : ''}" r="0"/>
		${rect(128, 474 + i * 150, 12, 12, color, 6)}
		${text(150, 485 + i * 150, status, { size: 14, fill: color })}`
		)
		.join('')}
	${rect(100, h - 170, w - 200, 90, PANEL, 26, BORDER)}
	${['house', 'calendar', 'checkmark', 'ticket', 'bubble'].map((_, i) => rect(150 + i * 120, h - 140, 30, 30, i === 1 ? ACCENT : '#3a3a44', 8)).join('')}
	</svg>`;
	return svgToPng(svg);
}

function whiteboard(): Promise<Buffer> {
	const w = 1600,
		h = 1200;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
	<defs>
		<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f1ea"/><stop offset="1" stop-color="#d9d4c7"/></linearGradient>
		<filter id="soft"><feGaussianBlur stdDeviation="1.2"/></filter>
	</defs>
	${rect(0, 0, w, h, 'url(#g)', 0)}
	<g stroke="#1d3557" stroke-width="7" fill="none" stroke-linecap="round" filter="url(#soft)">
		<rect x="180" y="200" width="380" height="240" rx="24"/>
		<rect x="720" y="160" width="420" height="180" rx="24"/>
		<rect x="720" y="420" width="420" height="180" rx="24"/>
		<rect x="1260" y="300" width="220" height="220" rx="110"/>
		<path d="M560 320 C 640 320, 640 250, 720 250"/>
		<path d="M560 340 C 640 340, 640 510, 720 510"/>
		<path d="M1140 250 C 1200 250, 1220 400, 1260 400"/>
		<path d="M1140 510 C 1200 510, 1220 420, 1260 420"/>
		<path d="M230 720 l 40 40 l 90 -90" stroke="#2a9d8f"/>
		<path d="M230 820 l 40 40 l 90 -90" stroke="#2a9d8f"/>
		<path d="M230 920 l 130 0" stroke="#e76f51"/>
	</g>
	<g font-family="Marker Felt, Chalkboard, Comic Sans MS, sans-serif" fill="#1d3557">
		${text(370, 300, 'Ticket', { size: 46, weight: 700, anchor: 'middle', fill: '#1d3557', family: 'inherit' })}
		${text(370, 360, '(client)', { size: 30, anchor: 'middle', fill: '#457b9d', family: 'inherit' })}
		${text(930, 262, 'Task', { size: 44, weight: 700, anchor: 'middle', fill: '#1d3557', family: 'inherit' })}
		${text(930, 522, 'Chat thread', { size: 40, weight: 700, anchor: 'middle', fill: '#1d3557', family: 'inherit' })}
		${text(1370, 422, 'Inbox', { size: 40, weight: 700, anchor: 'middle', fill: '#e76f51', family: 'inherit' })}
		${text(400, 745, 'convert keeps attachments', { size: 34, fill: '#1d3557', family: 'inherit' })}
		${text(400, 845, 'one thread per entity', { size: 34, fill: '#1d3557', family: 'inherit' })}
		${text(400, 945, 'push on mention only?!', { size: 34, fill: '#e76f51', family: 'inherit' })}
		${text(1100, 1080, 'sync 02.09.', { size: 28, fill: '#8a8a94', family: 'inherit' })}
	</g>
	<ellipse cx="1300" cy="1000" rx="260" ry="80" fill="#000" opacity="0.06"/>
	</svg>`;
	return svgToJpeg(svg);
}

function invoice(): Promise<Buffer> {
	const w = 1240,
		h = 1600;
	const lines = [
		['Trackr Cloud — Team plan (6 seats)', '6', '€ 12,00', '€ 72,00'],
		['Trackr Cloud — Team plan (2 seats, prorated)', '2', '€ 12,00', '€ 9,60'],
		['Priority support add-on', '1', '€ 49,00', '€ 49,00']
	];
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
	${rect(0, 0, w, h, '#ffffff', 0)}
	${text(100, 140, 'INVOICE', { size: 44, weight: 800, fill: '#111' })}
	${text(100, 180, 'No. 2026-08-0417  ·  Date 31.08.2026  ·  Due 14.09.2026', { size: 16, fill: '#666' })}
	${text(w - 100, 140, 'Trackr GmbH', { size: 20, weight: 700, fill: '#111', anchor: 'end' })}
	${text(w - 100, 168, 'Musterstraße 12 · 10115 Berlin', { size: 14, fill: '#666', anchor: 'end' })}
	${text(100, 280, 'Bill to', { size: 13, fill: '#999', weight: 700 })}
	${text(100, 310, 'Siweb GmbH', { size: 18, weight: 700, fill: '#111' })}
	${text(100, 336, 'Renée Carter · Industriestr. 4 · 70565 Stuttgart', { size: 14, fill: '#444' })}
	${rect(100, 420, w - 200, 44, '#f3f3f5', 6)}
	${text(120, 448, 'Description', { size: 13, fill: '#555', weight: 700 })}
	${text(800, 448, 'Qty', { size: 13, fill: '#555', weight: 700, anchor: 'end' })}
	${text(940, 448, 'Unit', { size: 13, fill: '#555', weight: 700, anchor: 'end' })}
	${text(w - 120, 448, 'Amount', { size: 13, fill: '#555', weight: 700, anchor: 'end' })}
	${lines
		.map(
			([d, q, u, a], i) => `
		${rect(100, 520 + i * 60, w - 200, 1, '#e5e5ea', 0)}
		${text(120, 508 + i * 60, d, { size: 15, fill: '#222' })}
		${text(800, 508 + i * 60, q, { size: 15, fill: '#222', anchor: 'end' })}
		${text(940, 508 + i * 60, u, { size: 15, fill: '#222', anchor: 'end' })}
		${text(w - 120, 508 + i * 60, a, { size: 15, fill: '#222', anchor: 'end' })}`
		)
		.join('')}
	${rect(700, 720, w - 800, 2, '#111', 0)}
	${text(720, 760, 'Subtotal', { size: 15, fill: '#444' })}${text(w - 120, 760, '€ 130,60', { size: 15, fill: '#222', anchor: 'end' })}
	${text(720, 792, 'VAT 19%', { size: 15, fill: '#444' })}${text(w - 120, 792, '€ 24,81', { size: 15, fill: '#222', anchor: 'end' })}
	${text(720, 836, 'Total', { size: 20, fill: '#111', weight: 800 })}${text(w - 120, 836, '€ 155,41', { size: 20, fill: '#111', weight: 800, anchor: 'end' })}
	<g transform="rotate(-8 620 300)">${rect(400, 250, 440, 90, 'none', 8, '#d62828')}${text(620, 310, 'AMOUNT DISPUTED', { size: 34, weight: 800, fill: '#d62828', anchor: 'middle' })}</g>
	<path d="M 120 1500 q 40 -60 90 -10 t 90 -20 t 110 10" stroke="#1d3557" stroke-width="3" fill="none"/>
	${text(100, 1540, 'Thank you for your business.', { size: 13, fill: '#999' })}
	</svg>`;
	return svgToPng(svg);
}

function hero(variant: 'A' | 'B'): Promise<Buffer> {
	const w = 1440,
		h = 900;
	const a = variant === 'A';
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
	<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a ? '#0f172a' : '#fdf6ec'}"/><stop offset="1" stop-color="${a ? '#1e293b' : '#f4d9c6'}"/></linearGradient></defs>
	${rect(0, 0, w, h, 'url(#bg)', 0)}
	${text(80, 70, 'webim', { size: 26, weight: 800, fill: a ? '#fff' : '#111' })}
	${text(w - 80, 70, 'Work   Services   Contact', { size: 15, fill: a ? '#94a3b8' : '#555', anchor: 'end' })}
	${text(80, 330, a ? 'Ads that pay for' : 'More leads.', { size: 76, weight: 800, fill: a ? '#fff' : '#111' })}
	${text(80, 420, a ? 'themselves.' : 'Less budget wasted.', { size: 76, weight: 800, fill: a ? '#fff' : '#111' })}
	${text(80, 490, a ? 'Performance campaigns for B2B teams that hate fluff.' : 'We run Google & LinkedIn campaigns for German B2B companies — and report in plain numbers.', { size: 22, fill: a ? '#cbd5e1' : '#444' })}
	${rect(80, 540, 260, 64, a ? '#e07a5f' : '#111', 14)}
	${text(210, 581, a ? 'Book a call' : 'Get a free audit', { size: 20, weight: 700, fill: '#fff', anchor: 'middle' })}
	${rect(880, 200, 480, 500, a ? '#1e293b' : '#fff', 24, a ? '#334155' : '#e5e5ea')}
	${text(910, 250, 'Cost per lead', { size: 14, fill: a ? '#94a3b8' : '#777', weight: 700 })}
	${text(910, 310, a ? '€ 31' : '€ 28', { size: 54, weight: 800, fill: a ? '#fff' : '#111' })}
	${[70, 62, 58, 50, 44, 38, 31].map((v, i) => rect(910 + i * 62, 640 - v * 4, 40, v * 4, a ? '#e07a5f' : '#111', 6)).join('')}
	${text(w / 2, h - 30, `Variant ${variant} · hero draft`, { size: 13, fill: a ? '#64748b' : '#999', anchor: 'middle' })}
	</svg>`;
	return svgToPng(svg);
}

function wireframe(): Promise<Buffer> {
	const w = 1600,
		h = 1000;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
	${rect(0, 0, w, h, '#fafafa', 0)}
	<g stroke="#9a9a9a" stroke-width="3" fill="#fff" stroke-dasharray="0">
		<rect x="40" y="40" width="240" height="920" rx="8"/>
		<rect x="320" y="40" width="1240" height="80" rx="8"/>
		${[0, 1, 2, 3, 4].map((i) => `<rect x="${320 + i * 250}" y="160" width="230" height="800" rx="8"/>`).join('')}
	</g>
	<g fill="#e0e0e0">
		${[0, 1, 2, 3, 4, 5, 6].map((i) => rect(60, 80 + i * 44, 200, 24, '#e0e0e0', 4)).join('')}
		${[0, 1, 2, 3, 4]
			.map((c) =>
				[0, 1, 2]
					.slice(0, 3 - (c % 2))
					.map((r) => rect(335 + c * 250, 220 + r * 120, 200, 96, '#eaeaea', 6))
					.join('')
			)
			.join('')}
	</g>
	<g font-family="${FONT}" fill="#555">
		${text(60, 66, 'Projects', { size: 16, weight: 700, fill: '#333' })}
		${text(340, 90, 'My Week  ·  Sep 2026', { size: 22, weight: 700, fill: '#333' })}
		${['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d, i) => text(345 + i * 250, 195, d, { size: 16, weight: 700, fill: '#333' })).join('')}
		${text(1200, 90, '[ + plan task ]', { size: 16, fill: '#777' })}
	</g>
	<g stroke="#d62828" stroke-width="4" fill="none"><path d="M 1100 600 C 1200 650, 1300 500, 1450 560"/><path d="M 1440 545 l 12 15 l -18 6"/></g>
	${text(1120, 640, 'drag between days', { size: 20, fill: '#d62828', family: 'Marker Felt, Chalkboard, sans-serif' })}
	</svg>`;
	return svgToPng(svg);
}

function brandLogo(): Buffer | null {
	const p = resolve(import.meta.dir, '../../../../brand/logo/pure-logo.png');
	return existsSync(p) ? readFileSync(p) : null;
}

/** A tiny but valid single-page PDF with a title line. */
function pdf(title: string): Buffer {
	const content = `BT /F1 24 Tf 72 720 Td (${title.replace(/[()\\]/g, '')}) Tj ET`;
	const objs = [
		'<< /Type /Catalog /Pages 2 0 R >>',
		'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
		'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
		`<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
		'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
	];
	let out = '%PDF-1.4\n';
	const offsets: number[] = [];
	objs.forEach((o, i) => {
		offsets.push(out.length);
		out += `${i + 1} 0 obj\n${o}\nendobj\n`;
	});
	const xref = out.length;
	out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
	for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
	out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
	return Buffer.from(out, 'latin1');
}

const csv = () =>
	Buffer.from(
		[
			'id,title,status,priority,assignee,due',
			'SIWEB-52,Checkout: retry payment fails silently,in_progress,urgent,Max Muster,2026-09-04',
			'SIWEB-18,SKU search returns duplicate rows,todo,high,Leon Vogel,2026-09-05',
			'SIWEB-31,Sticky table headers on long lists,todo,low,Ines Krüger,',
			'SIWEB-44,Export filtered tasks to CSV,backlog,low,Ines Krüger,'
		].join('\n') + '\n'
	);

/** Build every demo file once; the seeder attaches them by filename. */
export async function buildDemoFiles(): Promise<Map<string, DemoFile>> {
	const entries: [string, string, Buffer | Promise<Buffer> | null][] = [
		['checkout-error.png', 'image/png', checkoutError()],
		['sku-search-duplicates.png', 'image/png', skuSearch()],
		['dashboard-v2.png', 'image/png', dashboard()],
		['iphone-my-week.png', 'image/png', phoneMock()],
		['whiteboard-sync.jpg', 'image/jpeg', whiteboard()],
		['invoice-2026-08-0417.png', 'image/png', invoice()],
		['hero-variant-a.png', 'image/png', hero('A')],
		['hero-variant-b.png', 'image/png', hero('B')],
		['wireframe-week-view.png', 'image/png', wireframe()],
		['trackr-logo.png', 'image/png', brandLogo()],
		['inline-edit-spec.pdf', 'application/pdf', pdf('Inline edit - interaction spec v2')],
		['ads-media-plan-q4.pdf', 'application/pdf', pdf('Q4 media plan - Webim')],
		['siweb-open-tasks.csv', 'text/csv', csv()]
	];
	const out = new Map<string, DemoFile>();
	for (const [filename, mimeType, src] of entries) {
		const bytes = await src;
		if (!bytes) continue;
		out.set(filename, { filename, mimeType, bytes });
	}
	return out;
}
