import { m } from '$lib/paraglide/messages';
import { getLocale } from '$lib/paraglide/runtime';

// ─── Dates ───────────────────────────────────────────────────────────────────
// One display format app-wide: dd.mm.yyyy, with HH:mm (24h) when there's a
// time and dd.mm. when the year is left out. Machine formats (API, CSV, the
// value of a date field) stay ISO.

type DateInput = string | Date | null | undefined;
type DateParts = { y: number; mo: number; d: number; hh: number; mi: number; hasTime: boolean };

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Calendar parts of a date. A bare YYYY-MM-DD is taken as written (no time
 * zone shift, it's a calendar day); timestamps and Date objects are shown in
 * local time.
 */
function dateParts(input: DateInput): DateParts | null {
	if (!input) return null;
	if (typeof input === 'string') {
		const only = input.match(DATE_ONLY);
		if (only) {
			return { y: +only[1], mo: +only[2], d: +only[3], hh: 0, mi: 0, hasTime: false };
		}
	}
	const dt = input instanceof Date ? input : new Date(input);
	if (Number.isNaN(dt.getTime())) return null;
	return {
		y: dt.getFullYear(),
		mo: dt.getMonth() + 1,
		d: dt.getDate(),
		hh: dt.getHours(),
		mi: dt.getMinutes(),
		hasTime: true
	};
}

/** 13.11.2026 */
export function formatDate(input: DateInput): string {
	const p = dateParts(input);
	if (!p) return typeof input === 'string' ? input : '';
	return `${pad(p.d)}.${pad(p.mo)}.${p.y}`;
}

/** 13.11.2026, 14:05 — a bare date gets no time. */
export function formatDateTime(input: DateInput): string {
	const p = dateParts(input);
	if (!p) return typeof input === 'string' ? input : '';
	const date = `${pad(p.d)}.${pad(p.mo)}.${p.y}`;
	return p.hasTime ? `${date}, ${pad(p.hh)}:${pad(p.mi)}` : date;
}

/**
 * 13.11.2026, 14:05 in a given time zone — for server-rendered text such as
 * emails, where "local time" would be the server's.
 */
export function formatDateTimeIn(date: Date, timeZone: string): string {
	const parts = new Intl.DateTimeFormat('en-GB', {
		timeZone,
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	}).formatToParts(date);
	const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
	// Some runtimes render midnight as "24".
	const hour = get('hour') === '24' ? '00' : get('hour');
	return `${get('day')}.${get('month')}.${get('year')}, ${hour}:${get('minute')}`;
}

/** 14:05 (24h), local time. */
export function formatTime(input: DateInput): string {
	const p = dateParts(input);
	if (!p || !p.hasTime) return '';
	return `${pad(p.hh)}:${pad(p.mi)}`;
}

/** 13.11. — day and month, for compact labels where the year is implied. */
export function formatDateShort(input: DateInput): string {
	const p = dateParts(input);
	if (!p) return typeof input === 'string' ? input : '';
	return `${pad(p.d)}.${pad(p.mo)}.`;
}

/**
 * Di., 10.11. — localized short weekday plus day and month; the year is
 * added when it isn't the current one.
 */
export function formatWeekdayDate(input: DateInput): string {
	const p = dateParts(input);
	if (!p) return typeof input === 'string' ? input : '';
	const day = new Date(p.y, p.mo - 1, p.d);
	const weekday = new Intl.DateTimeFormat(getLocale(), { weekday: 'short' }).format(day);
	const date = p.y === new Date().getFullYear() ? formatDateShort(input) : formatDate(input);
	return `${weekday}, ${date}`;
}

/** Kept for existing callers: same as formatDate. */
export const formatDateLong = formatDate;

export type DueTone = 'overdue' | 'urgent' | 'soon' | 'normal';

// Relative due-date indicator. Returns a countdown label + urgency tone when
// the due date is within a week (or past), otherwise tone 'normal' with an
// empty label so callers fall back to the absolute date. `days` is whole-day
// difference from today (negative = overdue).
export function dueCountdown(
	iso: string | null | undefined
): { label: string; tone: DueTone; days: number } | null {
	if (!iso) return null;
	const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (!match) return null;
	const due = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);

	if (days < 0) return { label: m.due_overdue(), tone: 'overdue', days };
	if (days === 0) return { label: m.due_today(), tone: 'urgent', days };
	if (days === 1) return { label: m.due_one_day_left(), tone: 'urgent', days };
	if (days <= 3) return { label: m.due_days_left({ days }), tone: 'urgent', days };
	if (days <= 7) return { label: m.due_days_left({ days }), tone: 'soon', days };
	return { label: '', tone: 'normal', days };
}

export function formatEstimate(minutes: number | undefined): string {
	if (!minutes) return '—';
	const h = Math.floor(minutes / 60);
	const min = minutes % 60;
	if (h && min) return m.estimate_h_m({ h, m: min });
	if (h) return m.estimate_h({ h });
	return m.estimate_m({ m: min });
}
