// Shared helpers for the demo seeder: deterministic ids (so re-runs update in
// place instead of duplicating) and dates relative to "now" (so the workspace
// always looks freshly used — this week's plan is always *this* week).

import { createHash } from 'node:crypto';

/**
 * Deterministic UUID-shaped id derived from a stable name. Every demo row is
 * keyed this way so `bun run db:seed --all` is idempotent across runs.
 */
export function demoId(name: string): string {
	const h = createHash('sha1').update(`trackr-demo:${name}`).digest('hex');
	// Format as a v5-style UUID so anything validating "uuid-ish" ids is happy.
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const DAY = 24 * 60 * 60 * 1000;

/** Midnight (local) of today. */
export function today(): Date {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	return d;
}

/** Monday (local midnight) of the current week. */
export function weekStart(): Date {
	const t = today();
	const dow = (t.getDay() + 6) % 7; // Mon=0 … Sun=6
	return new Date(t.getTime() - dow * DAY);
}

/** A Date `offsetDays` from today at hh:mm (local). Negative = past. */
export function at(offsetDays: number, hh = 10, mm = 0): Date {
	const d = new Date(today().getTime() + offsetDays * DAY);
	d.setHours(hh, mm, 0, 0);
	return d;
}

/** A Date `n` days after this week's Monday (0=Mon … 4=Fri) at hh:mm. */
export function wk(n: number, hh = 10, mm = 0): Date {
	const d = new Date(weekStart().getTime() + n * DAY);
	d.setHours(hh, mm, 0, 0);
	return d;
}

/** 'YYYY-MM-DD' (local) for a Date. */
export function ymd(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

/** Escape text for embedding in HTML/SVG. */
export function esc(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
