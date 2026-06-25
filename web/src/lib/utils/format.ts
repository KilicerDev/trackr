import { m } from '$lib/paraglide/messages';
import { getLocale } from '$lib/paraglide/runtime';

const MONTHS_SHORT: Record<string, string[]> = {
	en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
	de: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
};

export function formatDateShort(iso: string | null | undefined): string {
	if (!iso) return '';
	const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (!match) return iso;
	const months = MONTHS_SHORT[getLocale()] ?? MONTHS_SHORT.en;
	return `${parseInt(match[3])} ${months[parseInt(match[2]) - 1]}`;
}

export function formatDateLong(iso: string | null | undefined): string {
	if (!iso) return '';
	const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (!m) return iso;
	return `${m[3]}.${m[2]}.${m[1]}`;
}

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
