import { fail } from '@sveltejs/kit';
import {
	ALLOWED_DENSITIES,
	ALLOWED_LANDINGS,
	ALLOWED_LOCALES,
	ALLOWED_THEMES,
	upsertPreferences,
	type PreferencePatch
} from '$lib/server/preferences';
import { cookieName } from '$lib/paraglide/runtime';
import type {
	DeliveryMode,
	DigestConfig,
	NotificationPrefs,
	QuietHours,
	ScopeMode
} from '$lib/server/db/app.schema';
import { m } from '$lib/paraglide/messages';
import type { Actions } from './$types';

// Must match the checkbox rows rendered in +page.svelte's `notifGroups`. Any
// key omitted here keeps its stored value untouched (upsert merges), so the
// legacy `mentioned` key is intentionally left out rather than being zeroed.
const NOTIFICATION_EVENTS = [
	'taskAssigned',
	'taskMentioned',
	'taskCommented',
	'taskStatusChanged',
	'taskDueSoon',
	'ticketCreated',
	'ticketAssigned',
	'ticketStatusChanged',
	'ticketMessage',
	'ticketMentioned',
	'chatMessage',
	'chatMentioned',
	'projectMentioned',
	'wikiUpdated'
] as const satisfies readonly (keyof NotificationPrefs)[];

export const actions: Actions = {
	update: async ({ request, locals, cookies }) => {
		if (!locals.user) return fail(401, { message: m.settings_err_not_authenticated() });

		const form = await request.formData();
		const theme = String(form.get('theme') ?? '');
		const density = String(form.get('density') ?? '');
		const defaultLanding = String(form.get('defaultLanding') ?? '');
		const weekStartsOn = Number(form.get('weekStartsOn') ?? '');
		const locale = String(form.get('locale') ?? '');

		if (!ALLOWED_THEMES.has(theme)) return fail(400, { message: m.settings_err_invalid_theme() });
		if (!ALLOWED_DENSITIES.has(density))
			return fail(400, { message: m.settings_err_invalid_density() });
		if (!ALLOWED_LANDINGS.has(defaultLanding))
			return fail(400, { message: m.settings_err_invalid_landing() });
		if (![0, 1].includes(weekStartsOn))
			return fail(400, { message: m.settings_err_invalid_week_start() });
		if (!ALLOWED_LOCALES.has(locale))
			return fail(400, { message: m.settings_err_invalid_language() });

		await upsertPreferences(locals.user.id, {
			theme,
			density,
			defaultLanding,
			weekStartsOn,
			locale
		});

		// Carry the new locale to the next request so SSR renders in the chosen
		// language immediately (the layout reload picks it up via the cookie).
		// httpOnly:false is REQUIRED — Paraglide's client runtime reads this
		// cookie via document.cookie to resolve the locale after hydration; an
		// httpOnly cookie would be invisible to it, so the client would fall back
		// to the browser language and the UI would silently revert on navigation.
		cookies.set(cookieName, locale, {
			path: '/',
			maxAge: 60 * 60 * 24 * 400,
			httpOnly: false,
			sameSite: 'lax'
		});

		return { success: true };
	},

	updateNotifications: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { message: m.settings_err_not_authenticated() });
		const form = await request.formData();

		const parseMode = (v: FormDataEntryValue | null): DeliveryMode => {
			const s = String(v ?? '');
			return s === 'instant' || s === 'digest' ? s : 'off';
		};
		// Only keys rendered for this user are submitted (the page hides surfaces
		// the role can't reach). The `.email` hidden input marks a rendered row —
		// absent rows are skipped entirely so their stored values survive the
		// upsert merge instead of being zeroed.
		const next: NotificationPrefs = {};
		for (const k of NOTIFICATION_EVENTS) {
			if (!form.has(`${k}.email`)) continue;
			next[k] = {
				email: parseMode(form.get(`${k}.email`)),
				inApp: form.get(`${k}.inApp`) === 'on'
			};
		}

		// Quiet hours + digest cadence. Invalid/missing values fall back to the
		// safe defaults rather than failing the whole save.
		const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
		const parseTime = (v: FormDataEntryValue | null, fallback: string): string => {
			const s = String(v ?? '');
			return timeRe.test(s) ? s : fallback;
		};
		const quietHours: QuietHours = {
			enabled: form.get('quietHours.enabled') === 'on',
			start: parseTime(form.get('quietHours.start'), '20:00'),
			end: parseTime(form.get('quietHours.end'), '08:00'),
			weekends: form.get('quietHours.weekends') === 'on'
		};

		const freq = String(form.get('digest.frequency') ?? '');
		const hour = Number(form.get('digest.hour') ?? '');
		const digest: DigestConfig = {
			frequency: freq === 'hourly' ? 'hourly' : 'daily',
			hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 9
		};

		const patch: PreferencePatch = { notifications: next, quietHours, digest };

		// Scope is only submitted by see-all users (both fields together). Absent
		// fields leave the stored scope untouched via the upsert merge.
		const parseScope = (v: FormDataEntryValue | null): ScopeMode | null => {
			const s = String(v ?? '');
			return s === 'all' || s === 'participating' || s === 'mentions' ? s : null;
		};
		const scopeTickets = parseScope(form.get('scope.tickets'));
		const scopeChat = parseScope(form.get('scope.chat'));
		if (scopeTickets && scopeChat) {
			patch.notificationScope = { tickets: scopeTickets, chat: scopeChat };
		}

		await upsertPreferences(locals.user.id, patch);
		return { success: true };
	}
};
