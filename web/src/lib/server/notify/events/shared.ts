// Small helpers shared by the notify/events modules.
import { DIGEST_TZ } from '../digest';
import type { Locale } from '$lib/paraglide/runtime';

// The user who performed the action. Every event call site is a request
// handler acting as `locals.user`, so the name comes for free — no DB join.
export type NotifyActor = { id: string; name: string };

// Localized timestamp for the email meta rows, in the app's display timezone
// (DIGEST_TZ — the same zone quiet hours and digests reason in).
export function emailDate(locale: Locale, date: Date = new Date()): string {
	return new Intl.DateTimeFormat(locale, {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone: DIGEST_TZ
	}).format(date);
}
