// Date display for the MCP widgets.
// Same display format as the app ($lib/utils/format, not importable here: the
// widgets are a standalone bundle). dd.mm.yyyy, HH:mm when there's a time, dd.mm.
// without the year. Bare YYYY-MM-DD is a calendar day (no zone shift);
// timestamps show in local time.

const pad2 = (n: number) => String(n).padStart(2, '0');

function dateParts(iso: string): { y: number; mo: number; d: number; time: string | null } | null {
	const only = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (only) return { y: +only[1], mo: +only[2], d: +only[3], time: null };
	const t = new Date(iso);
	if (!Number.isFinite(t.getTime())) return null;
	return {
		y: t.getFullYear(),
		mo: t.getMonth() + 1,
		d: t.getDate(),
		time: `${pad2(t.getHours())}:${pad2(t.getMinutes())}`
	};
}

/** `07.09.`, like the app's list columns. */
export function dateShort(iso: string | null | undefined): string {
	if (!iso) return '';
	const p = dateParts(iso);
	return p ? `${pad2(p.d)}.${pad2(p.mo)}.` : iso;
}

/** `07.09.2026`. */
export function dateFull(iso: string | null | undefined): string {
	if (!iso) return '—';
	const p = dateParts(iso);
	return p ? `${pad2(p.d)}.${pad2(p.mo)}.${p.y}` : iso;
}

/** `07.09.2026, 14:05` (just the date for a bare day). */
export function dateTime(iso: string | null | undefined): string {
	if (!iso) return '—';
	const p = dateParts(iso);
	if (!p) return iso;
	const date = `${pad2(p.d)}.${pad2(p.mo)}.${p.y}`;
	return p.time ? `${date}, ${p.time}` : date;
}
