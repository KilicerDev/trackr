// Shared client-side helpers for ticket time/SLA signals, used by both the list
// rows and the board cards so they stay in sync. All values are derived from the
// fields already on TicketRow — no extra fetch, no schema change.
import { m } from '$lib/paraglide/messages';
import type { TicketRow } from '$lib/server/tickets';

// Relative "5m ago" / "3h ago" formatting, matching the ticket detail/list views.
export function relTime(iso: string | null): string {
	if (!iso) return '';
	const ts = new Date(iso).getTime();
	if (Number.isNaN(ts)) return '';
	const diff = Date.now() - ts;
	const mins = Math.floor(diff / 60_000);
	if (mins < 1) return m.tickets_just_now();
	if (mins < 60) return m.tickets_min_ago({ m: mins });
	const h = Math.floor(mins / 60);
	if (h < 24) return m.tickets_hour_ago({ h });
	const d = Math.floor(h / 24);
	if (d < 7) return m.tickets_day_ago({ d });
	return new Date(iso).toLocaleDateString();
}

export type SlaTone = 'wait' | 'ok' | 'muted';
export type SlaSignal = { tone: SlaTone; dot: string; label: string };

const TONE_DOT: Record<SlaTone, string> = {
	wait: '#e9c46a',
	ok: '#7fc8a9',
	muted: '#7c7c84'
};

// A single muted management signal for a ticket:
// - active ticket with no agent reply yet → "Awaiting first response · {age}"
// - resolved/closed → "Resolved {when}"
// - otherwise → null (the row/card already shows last-activity time)
export function slaSignal(t: TicketRow): SlaSignal | null {
	const closed = t.status === 'resolved' || t.status === 'closed';
	if (!closed && !t.firstResponseAt) {
		return {
			tone: 'wait',
			dot: TONE_DOT.wait,
			label: m.tickets_sla_awaiting({ age: relTime(t.createdAt) })
		};
	}
	if (closed) {
		const when = t.resolvedAt ?? t.closedAt;
		if (when) {
			return {
				tone: 'ok',
				dot: TONE_DOT.ok,
				label: m.tickets_sla_resolved({ when: relTime(when) })
			};
		}
	}
	return null;
}
