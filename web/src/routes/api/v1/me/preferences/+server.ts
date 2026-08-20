// User preferences for the native app. GET returns the resolved preferences
// (defaults merged in, exactly what the web settings page sees); PATCH accepts
// a partial update and is merge-tolerant like the web form action: any key the
// client doesn't send keeps its stored value, so a client that renders only a
// subset of notification events can never zero the rest.
import {
	ALLOWED_DENSITIES,
	ALLOWED_LANDINGS,
	ALLOWED_LOCALES,
	ALLOWED_THEMES,
	NOTIFICATION_DEFAULTS,
	getPreferences,
	upsertPreferences,
	type PreferencePatch,
	type ResolvedPreferences
} from '$lib/server/preferences';
import type {
	DeliveryMode,
	DigestConfig,
	NotificationChannelPrefs,
	NotificationPrefs,
	NotificationScope,
	QuietHours,
	ScopeMode
} from '$lib/server/db/app.schema';
import { apiError, json, readJson, requireUser } from '$lib/server/api/guard';
import type { RequestHandler } from './$types';

// The client-editable notification keys: everything except the legacy
// `mentioned` key (kept server-side for old stored prefs, never emitted).
const NOTIFICATION_EVENTS = Object.keys(NOTIFICATION_DEFAULTS).filter(
	(k) => k !== 'mentioned'
) as (keyof NotificationPrefs)[];

function publicPreferences(prefs: ResolvedPreferences) {
	// viewState is web view bookkeeping (column layouts etc.) — not for mobile.
	return {
		theme: prefs.theme,
		density: prefs.density,
		defaultLanding: prefs.defaultLanding,
		weekStartsOn: prefs.weekStartsOn,
		locale: prefs.locale,
		notifications: prefs.notifications,
		quietHours: prefs.quietHours,
		digest: prefs.digest,
		notificationScope: prefs.notificationScope
	};
}

export const GET: RequestHandler = async ({ locals }) => {
	const user = requireUser(locals);
	const prefs = await getPreferences(user.id);
	return json({ preferences: publicPreferences(prefs) });
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseDeliveryMode(v: unknown): DeliveryMode | null {
	return v === 'off' || v === 'instant' || v === 'digest' ? v : null;
}

function parseScopeMode(v: unknown): ScopeMode | null {
	return v === 'all' || v === 'participating' || v === 'mentions' ? v : null;
}

export const PATCH: RequestHandler = async ({ locals, request }) => {
	const user = requireUser(locals);
	const body = await readJson<Record<string, unknown>>(request);
	const patch: PreferencePatch = {};

	if (body.theme !== undefined) {
		if (typeof body.theme !== 'string' || !ALLOWED_THEMES.has(body.theme))
			apiError(400, 'Invalid theme.');
		patch.theme = body.theme;
	}
	if (body.density !== undefined) {
		if (typeof body.density !== 'string' || !ALLOWED_DENSITIES.has(body.density))
			apiError(400, 'Invalid density.');
		patch.density = body.density;
	}
	if (body.defaultLanding !== undefined) {
		if (typeof body.defaultLanding !== 'string' || !ALLOWED_LANDINGS.has(body.defaultLanding))
			apiError(400, 'Invalid default landing.');
		patch.defaultLanding = body.defaultLanding;
	}
	if (body.weekStartsOn !== undefined) {
		if (body.weekStartsOn !== 0 && body.weekStartsOn !== 1)
			apiError(400, 'Invalid week start.');
		patch.weekStartsOn = body.weekStartsOn;
	}
	if (body.locale !== undefined) {
		if (typeof body.locale !== 'string' || !ALLOWED_LOCALES.has(body.locale))
			apiError(400, 'Invalid locale.');
		patch.locale = body.locale;
	}

	if (body.notifications !== undefined) {
		if (typeof body.notifications !== 'object' || body.notifications === null)
			apiError(400, 'Invalid notifications.');
		const next: NotificationPrefs = {};
		for (const [key, raw] of Object.entries(body.notifications as Record<string, unknown>)) {
			if (!NOTIFICATION_EVENTS.includes(key as keyof NotificationPrefs))
				apiError(400, `Unknown notification event: ${key}`);
			if (typeof raw !== 'object' || raw === null)
				apiError(400, `Invalid value for notification event: ${key}`);
			const channel = raw as Record<string, unknown>;
			const email = parseDeliveryMode(channel.email);
			if (email === null || typeof channel.inApp !== 'boolean')
				apiError(400, `Invalid value for notification event: ${key}`);
			next[key as keyof NotificationPrefs] = {
				email,
				inApp: channel.inApp
			} satisfies NotificationChannelPrefs;
		}
		patch.notifications = next;
	}

	if (body.quietHours !== undefined) {
		if (typeof body.quietHours !== 'object' || body.quietHours === null)
			apiError(400, 'Invalid quiet hours.');
		const qh = body.quietHours as Record<string, unknown>;
		if (
			typeof qh.enabled !== 'boolean' ||
			typeof qh.weekends !== 'boolean' ||
			typeof qh.start !== 'string' ||
			typeof qh.end !== 'string' ||
			!TIME_RE.test(qh.start) ||
			!TIME_RE.test(qh.end)
		)
			apiError(400, 'Invalid quiet hours.');
		patch.quietHours = {
			enabled: qh.enabled,
			start: qh.start,
			end: qh.end,
			weekends: qh.weekends
		} satisfies QuietHours;
	}

	if (body.digest !== undefined) {
		if (typeof body.digest !== 'object' || body.digest === null) apiError(400, 'Invalid digest.');
		const d = body.digest as Record<string, unknown>;
		if (
			(d.frequency !== 'hourly' && d.frequency !== 'daily') ||
			typeof d.hour !== 'number' ||
			!Number.isInteger(d.hour) ||
			d.hour < 0 ||
			d.hour > 23
		)
			apiError(400, 'Invalid digest.');
		patch.digest = { frequency: d.frequency, hour: d.hour } satisfies DigestConfig;
	}

	if (body.notificationScope !== undefined) {
		if (typeof body.notificationScope !== 'object' || body.notificationScope === null)
			apiError(400, 'Invalid notification scope.');
		const s = body.notificationScope as Record<string, unknown>;
		const tickets = parseScopeMode(s.tickets);
		const chat = parseScopeMode(s.chat);
		if (!tickets || !chat) apiError(400, 'Invalid notification scope.');
		patch.notificationScope = { tickets, chat } satisfies NotificationScope;
	}

	if (Object.keys(patch).length === 0) apiError(400, 'Empty patch.');

	await upsertPreferences(user.id, patch);
	const prefs = await getPreferences(user.id);
	return json({ ok: true, preferences: publicPreferences(prefs) });
};
