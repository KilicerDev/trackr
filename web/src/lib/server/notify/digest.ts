// Digest + quiet-hours helpers shared by the emit path (`notify()`).
//
// The actual rollup email is sent by the Go worker's `notify.digest` scheduled
// job; this file only decides *what to defer* and writes the pending rows. All
// local-time reasoning happens in DIGEST_TZ so quiet hours and the daily digest
// hour mean the same thing here and in the worker (which reads the same env).

import { env } from '$env/dynamic/private';
import { db } from '../db';
import { notificationDigestItem, type NotificationKind, type QuietHours } from '../db/app.schema';

export const DIGEST_TZ = env.DIGEST_TZ || 'Europe/Berlin';

// Local hour/minute/weekday in DIGEST_TZ for `now`. weekday: 0=Sun … 6=Sat.
function zonedParts(now: Date): { hour: number; minute: number; weekday: number } {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: DIGEST_TZ,
		hour: '2-digit',
		minute: '2-digit',
		weekday: 'short',
		hour12: false
	}).formatToParts(now);
	const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
	const weekdayMap: Record<string, number> = {
		Sun: 0,
		Mon: 1,
		Tue: 2,
		Wed: 3,
		Thu: 4,
		Fri: 5,
		Sat: 6
	};
	// Intl renders midnight as "24" in some runtimes; fold it back to 0.
	const hour = Number(get('hour')) % 24;
	return { hour, minute: Number(get('minute')), weekday: weekdayMap[get('weekday')] ?? 0 };
}

function toMinutes(hhmm: string): number {
	const [h, m] = hhmm.split(':').map(Number);
	if (Number.isNaN(h) || Number.isNaN(m)) return -1;
	return h * 60 + m;
}

// Whether instant email should be suppressed (and deferred to digest) right now
// for a user with these quiet-hours settings.
export function isWithinQuietHours(q: QuietHours, now: Date = new Date()): boolean {
	if (!q.enabled) return false;
	const { hour, minute, weekday } = zonedParts(now);
	if (q.weekends && (weekday === 0 || weekday === 6)) return true;
	const start = toMinutes(q.start);
	const end = toMinutes(q.end);
	if (start < 0 || end < 0 || start === end) return false;
	const nowMin = hour * 60 + minute;
	// Non-wrapping window (e.g. 01:00–06:00) vs one that crosses midnight
	// (e.g. 20:00–08:00): the latter matches times after start OR before end.
	return start < end ? nowMin >= start && nowMin < end : nowMin >= start || nowMin < end;
}

export type DigestItemInput = {
	userId: string;
	orgId: string | null;
	kind: NotificationKind;
	title: string;
	body: string | null;
	url: string;
};

// Queue notifications for the next digest flush. Best-effort: a failed insert is
// logged, never thrown, so it can't break the originating request.
export async function enqueueDigestItems(items: DigestItemInput[]): Promise<void> {
	if (items.length === 0) return;
	try {
		await db.insert(notificationDigestItem).values(
			items.map((it) => ({
				id: crypto.randomUUID(),
				userId: it.userId,
				orgId: it.orgId,
				kind: it.kind,
				title: it.title,
				body: it.body,
				url: it.url
			}))
		);
	} catch (err) {
		console.error('enqueueDigestItems failed', err);
	}
}
