// Small helpers shared by the notify/events modules.
import { DIGEST_TZ } from '../digest';
import type { Locale } from '$lib/paraglide/runtime';
import { formatDateTimeIn } from '$lib/utils/format';

// The user who performed the action. Every event call site is a request
// handler acting as `locals.user`, so the name comes for free — no DB join.
export type NotifyActor = { id: string; name: string };

// Timestamp for the email meta rows (dd.mm.yyyy, HH:mm), in the app's display
// timezone (DIGEST_TZ — the same zone quiet hours and digests reason in). The
// format is the same in every language, like the rest of the app; `locale`
// stays in the signature for the callers.
export function emailDate(_locale: Locale, date: Date = new Date()): string {
	return formatDateTimeIn(date, DIGEST_TZ);
}
