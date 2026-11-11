/**
 * Recurring-task rules: the shape, validation and "when is the next one"
 * arithmetic. Shared by the server (the runner and the API) and the UI (the
 * repeat picker's preview), so both agree on every date.
 *
 * A rule is evaluated on calendar dates in the series' IANA timezone; each
 * matching date fires at the series' local `time`. Dates are handled as
 * date-only values (UTC midnight Date objects) so DST never shifts a day.
 *
 *   daily    every `interval` days, counted from `startsOn`
 *   weekly   on `weekdays` (ISO 1=Mon … 7=Sun; default startsOn's weekday),
 *            every `interval` weeks counted from startsOn's week
 *   monthly  on `monthDay` (default startsOn's day; clamped to short months),
 *            every `interval` months counted from startsOn's month
 *   yearly   on startsOn's month/day (Feb 29 → Feb 28), every `interval` years
 */

/**
 * Moving the newest task of a series into one of these statuses creates the
 * series' next task right away (it's handed off, finished or dropped), instead
 * of waiting for the scheduled time.
 */
export const RECURRENCE_ADVANCE_STATUSES: ReadonlySet<string> = new Set([
	'in_review',
	'done',
	'cancelled'
]);

export const RECURRENCE_FREQS = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export type RecurrenceFreq = (typeof RECURRENCE_FREQS)[number];

export type RecurrenceRule = {
	freq: RecurrenceFreq;
	interval: number;
	/** weekly only: ISO weekdays, 1 = Monday … 7 = Sunday. */
	weekdays?: number[];
	/** monthly only: day of month 1–31 (clamped to the month's last day). */
	monthDay?: number;
};

/** The schedule part of a series, as stored and as sent by the UI. */
export type RecurrenceSchedule = {
	rule: RecurrenceRule;
	/** HH:MM, local to `timezone`. */
	time: string;
	timezone: string;
	/** YYYY-MM-DD; first day the rule may fire and the interval anchor. */
	startsOn: string;
	/** YYYY-MM-DD, inclusive; null = forever. */
	endsOn: string | null;
};

/** What the task inspector shows for a task's series. */
export type RecurrenceSeriesDTO = {
	id: string;
	schedule: RecurrenceSchedule;
	dueOffsetDays: number | null;
	/** ISO instant of the next occurrence; null once the series has ended. */
	nextRunAt: string | null;
	lastRunAt: string | null;
	paused: boolean;
	/** Set when the runner paused it: 'owner_missing' | 'no_permission' | 'project_archived'. */
	pausedReason: string | null;
	owner: { id: string; name: string } | null;
	templateTitle: string;
};

const MAX_INTERVAL: Record<RecurrenceFreq, number> = {
	daily: 365,
	weekly: 52,
	monthly: 24,
	yearly: 10
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_MS = 86_400_000;

export function isValidTimezone(tz: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}

function parseDate(s: string): Date | null {
	const m = DATE_RE.exec(s);
	if (!m) return null;
	const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
	return d.toISOString().slice(0, 10) === s ? d : null;
}

export function formatDate(d: Date): string {
	return d.toISOString().slice(0, 10);
}

/**
 * Validate and normalise untrusted input (API body). Returns the clean
 * schedule or an error string naming the first problem.
 */
export function parseSchedule(
	raw: unknown
): { ok: true; value: RecurrenceSchedule } | { ok: false; error: string } {
	if (!raw || typeof raw !== 'object') return { ok: false, error: 'schedule must be an object' };
	const r = raw as Record<string, unknown>;
	const ruleRaw = r.rule as Record<string, unknown> | undefined;
	if (!ruleRaw || typeof ruleRaw !== 'object') return { ok: false, error: 'rule is required' };

	const freq = ruleRaw.freq as RecurrenceFreq;
	if (!RECURRENCE_FREQS.includes(freq)) return { ok: false, error: 'rule.freq is invalid' };
	const interval = ruleRaw.interval === undefined ? 1 : Number(ruleRaw.interval);
	if (!Number.isInteger(interval) || interval < 1 || interval > MAX_INTERVAL[freq]) {
		return { ok: false, error: `rule.interval must be 1–${MAX_INTERVAL[freq]}` };
	}
	const rule: RecurrenceRule = { freq, interval };
	if (freq === 'weekly' && ruleRaw.weekdays !== undefined) {
		if (!Array.isArray(ruleRaw.weekdays))
			return { ok: false, error: 'rule.weekdays must be an array' };
		const days = [...new Set(ruleRaw.weekdays.map(Number))].sort((a, b) => a - b);
		if (days.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) {
			return { ok: false, error: 'rule.weekdays must be 1–7' };
		}
		if (days.length > 0) rule.weekdays = days;
	}
	if (freq === 'monthly' && ruleRaw.monthDay !== undefined && ruleRaw.monthDay !== null) {
		const md = Number(ruleRaw.monthDay);
		if (!Number.isInteger(md) || md < 1 || md > 31)
			return { ok: false, error: 'rule.monthDay must be 1–31' };
		rule.monthDay = md;
	}

	const time = r.time === undefined ? '09:00' : String(r.time);
	if (!TIME_RE.test(time)) return { ok: false, error: 'time must be HH:MM' };
	const timezone = r.timezone === undefined ? 'Europe/Berlin' : String(r.timezone);
	if (!isValidTimezone(timezone)) return { ok: false, error: 'timezone is not a valid IANA zone' };
	const startsOn = String(r.startsOn ?? '');
	if (!parseDate(startsOn)) return { ok: false, error: 'startsOn must be YYYY-MM-DD' };
	let endsOn: string | null = null;
	if (r.endsOn !== undefined && r.endsOn !== null && r.endsOn !== '') {
		endsOn = String(r.endsOn);
		if (!parseDate(endsOn)) return { ok: false, error: 'endsOn must be YYYY-MM-DD' };
		if (endsOn < startsOn) return { ok: false, error: 'endsOn is before startsOn' };
	}
	return { ok: true, value: { rule, time, timezone, startsOn, endsOn } };
}

// ── Timezone helpers ─────────────────────────────────────────────────────────

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string): Intl.DateTimeFormat {
	let f = dtfCache.get(tz);
	if (!f) {
		f = new Intl.DateTimeFormat('en-US', {
			timeZone: tz,
			hourCycle: 'h23',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
		dtfCache.set(tz, f);
	}
	return f;
}

/** Wall-clock fields of `instant` in `tz`. */
function zonedParts(instant: Date, tz: string) {
	const p: Record<string, number> = {};
	for (const part of dtf(tz).formatToParts(instant)) {
		if (part.type !== 'literal') p[part.type] = Number(part.value);
	}
	return { y: p.year, mo: p.month, d: p.day, h: p.hour, mi: p.minute, s: p.second };
}

/** Offset of `tz` from UTC at `instant`, in ms (positive east of Greenwich). */
function tzOffset(instant: number, tz: string): number {
	const z = zonedParts(new Date(instant), tz);
	return Date.UTC(z.y, z.mo - 1, z.d, z.h, z.mi, z.s) - (instant - (instant % 1000));
}

/**
 * The instant at which local `date` + `time` occurs in `tz`. A wall time that
 * doesn't exist (spring-forward gap) lands just after the gap.
 */
export function zonedInstant(date: Date, time: string, tz: string): Date {
	const [h, mi] = time.split(':').map(Number);
	const wall = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), h, mi);
	let guess = wall - tzOffset(wall, tz);
	guess = wall - tzOffset(guess, tz);
	return new Date(guess);
}

/** The local calendar date (as a date-only value) of `instant` in `tz`. */
export function zonedDate(instant: Date, tz: string): Date {
	const z = zonedParts(instant, tz);
	return new Date(Date.UTC(z.y, z.mo - 1, z.d));
}

// ── Rule matching ────────────────────────────────────────────────────────────

const daysInMonth = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
const isoWeekday = (d: Date) => ((d.getUTCDay() + 6) % 7) + 1;
const mondayOf = (d: Date) => d.getTime() - (isoWeekday(d) - 1) * DAY_MS;

function matches(rule: RecurrenceRule, anchor: Date, d: Date): boolean {
	if (d < anchor) return false;
	const interval = Math.max(1, rule.interval);
	switch (rule.freq) {
		case 'daily':
			return Math.round((d.getTime() - anchor.getTime()) / DAY_MS) % interval === 0;
		case 'weekly': {
			const days = rule.weekdays?.length ? rule.weekdays : [isoWeekday(anchor)];
			if (!days.includes(isoWeekday(d))) return false;
			const weeks = Math.round((mondayOf(d) - mondayOf(anchor)) / (7 * DAY_MS));
			return weeks % interval === 0;
		}
		case 'monthly': {
			const months =
				(d.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
				d.getUTCMonth() -
				anchor.getUTCMonth();
			if (months % interval !== 0) return false;
			const want = rule.monthDay ?? anchor.getUTCDate();
			return d.getUTCDate() === Math.min(want, daysInMonth(d.getUTCFullYear(), d.getUTCMonth()));
		}
		case 'yearly': {
			const years = d.getUTCFullYear() - anchor.getUTCFullYear();
			if (years % interval !== 0 || d.getUTCMonth() !== anchor.getUTCMonth()) return false;
			return (
				d.getUTCDate() ===
				Math.min(anchor.getUTCDate(), daysInMonth(d.getUTCFullYear(), d.getUTCMonth()))
			);
		}
	}
}

// Longest gap between two matches: yearly × 10, plus slack.
const SCAN_LIMIT_DAYS = 366 * 11;

/**
 * The first occurrence strictly after `after`: its local date and the instant
 * it fires. Null when the series has ended (past `endsOn`).
 */
export function nextOccurrence(
	s: RecurrenceSchedule,
	after: Date
): { date: string; at: Date } | null {
	const anchor = parseDate(s.startsOn);
	if (!anchor) return null;
	const end = s.endsOn ? parseDate(s.endsOn) : null;
	// Start one day early: `after`'s local date may still have a later slot,
	// and the zone's date can trail the UTC date.
	let d = new Date(Math.max(zonedDate(after, s.timezone).getTime() - DAY_MS, anchor.getTime()));
	for (let i = 0; i < SCAN_LIMIT_DAYS; i++, d = new Date(d.getTime() + DAY_MS)) {
		if (end && d > end) return null;
		if (!matches(s.rule, anchor, d)) continue;
		const at = zonedInstant(d, s.time, s.timezone);
		if (at > after) return { date: formatDate(d), at };
	}
	return null;
}

/** The next `count` occurrences after `after` (for the picker's preview). */
export function upcomingOccurrences(
	s: RecurrenceSchedule,
	after: Date,
	count: number
): { date: string; at: Date }[] {
	const out: { date: string; at: Date }[] = [];
	let cursor = after;
	while (out.length < count) {
		const n = nextOccurrence(s, cursor);
		if (!n) break;
		out.push(n);
		cursor = n.at;
	}
	return out;
}

/** `date` (YYYY-MM-DD) shifted by `days`, as a UTC-midnight Date (the due-date storage form). */
export function addDays(date: string, days: number): Date {
	const d = parseDate(date);
	if (!d) throw new Error(`invalid date ${date}`);
	return new Date(d.getTime() + days * DAY_MS);
}
