import { eq, sql } from 'drizzle-orm';
import { db } from './db';
import {
	userPreferences,
	type DeliveryMode,
	type DigestConfig,
	type LinkedInstance,
	type NotificationChannelPrefs,
	type NotificationPrefs,
	type NotificationScope,
	type QuietHours,
	type UserPreferences
} from './db/app.schema';

export const PREF_DEFAULTS = {
	theme: 'dark' as const,
	density: 'comfortable' as const,
	defaultLanding: '/week',
	weekStartsOn: 1,
	locale: 'en'
};

// Inert defaults: quiet hours disabled, and a daily digest window that only
// takes effect for events a user has explicitly switched to 'digest' email.
export const QUIET_HOURS_DEFAULT: QuietHours = {
	enabled: false,
	start: '20:00',
	end: '08:00',
	weekends: true
};
export const DIGEST_DEFAULT: DigestConfig = { frequency: 'daily', hour: 9 };
export const NOTIFICATION_SCOPE_DEFAULT: NotificationScope = { tickets: 'all', chat: 'all' };

export const NOTIFICATION_DEFAULTS: Required<NotificationPrefs> = {
	mentioned: { email: 'instant', inApp: true },
	taskAssigned: { email: 'instant', inApp: true },
	taskMentioned: { email: 'instant', inApp: true },
	taskCommented: { email: 'off', inApp: true },
	taskStatusChanged: { email: 'off', inApp: true },
	taskDueSoon: { email: 'instant', inApp: true },
	ticketCreated: { email: 'instant', inApp: true },
	ticketAssigned: { email: 'instant', inApp: true },
	ticketStatusChanged: { email: 'off', inApp: true },
	ticketMessage: { email: 'instant', inApp: true },
	ticketMentioned: { email: 'instant', inApp: true },
	chatMessage: { email: 'off', inApp: true },
	chatMentioned: { email: 'instant', inApp: true },
	projectMentioned: { email: 'instant', inApp: true },
	wikiUpdated: { email: 'off', inApp: false },
	// Admin-only system notice (a webhook was auto-disabled). Not user-configurable.
	webhookDisabled: { email: 'instant', inApp: true }
};

// Stored prefs predate delivery modes and may carry `email: true|false`.
// Normalize every read so callers only ever see a DeliveryMode.
function normalizeEmail(v: unknown): DeliveryMode {
	if (v === true) return 'instant';
	if (v === false) return 'off';
	if (v === 'instant' || v === 'digest' || v === 'off') return v;
	return 'off';
}

function normalizeNotifications(
	merged: Record<string, { email?: unknown; inApp?: unknown }>
): Required<NotificationPrefs> {
	const out = {} as Record<string, NotificationChannelPrefs>;
	for (const key of Object.keys(NOTIFICATION_DEFAULTS)) {
		const raw = merged[key] ?? {};
		out[key] = { email: normalizeEmail(raw.email), inApp: raw.inApp === true };
	}
	return out as Required<NotificationPrefs>;
}

export type ResolvedPreferences = Omit<
	UserPreferences,
	'notifications' | 'createdAt' | 'updatedAt'
> & {
	notifications: Required<NotificationPrefs>;
};

export async function getPreferences(userId: string): Promise<ResolvedPreferences> {
	const [row] = await db
		.select()
		.from(userPreferences)
		.where(eq(userPreferences.userId, userId))
		.limit(1);

	if (!row) {
		return {
			userId,
			...PREF_DEFAULTS,
			notifications: NOTIFICATION_DEFAULTS,
			quietHours: QUIET_HOURS_DEFAULT,
			digest: DIGEST_DEFAULT,
			notificationScope: NOTIFICATION_SCOPE_DEFAULT,
			viewState: {},
			instances: []
		};
	}

	return {
		userId: row.userId,
		theme: row.theme,
		density: row.density,
		defaultLanding: row.defaultLanding,
		weekStartsOn: row.weekStartsOn,
		locale: row.locale,
		notifications: normalizeNotifications({
			...NOTIFICATION_DEFAULTS,
			...(row.notifications ?? {})
		}),
		quietHours: { ...QUIET_HOURS_DEFAULT, ...(row.quietHours ?? {}) },
		digest: { ...DIGEST_DEFAULT, ...(row.digest ?? {}) },
		notificationScope: { ...NOTIFICATION_SCOPE_DEFAULT, ...(row.notificationScope ?? {}) },
		viewState: row.viewState ?? {},
		instances: Array.isArray(row.instances) ? row.instances : []
	};
}

export type PreferencePatch = Partial<{
	theme: string;
	density: string;
	defaultLanding: string;
	weekStartsOn: number;
	locale: string;
	notifications: NotificationPrefs;
	quietHours: QuietHours;
	digest: DigestConfig;
	notificationScope: NotificationScope;
	viewState: Record<string, unknown>;
	// Whole-list replace (the switcher always sends the full list).
	instances: LinkedInstance[];
}>;

export async function upsertPreferences(userId: string, patch: PreferencePatch) {
	const existing = await getPreferences(userId);
	const merged = {
		userId,
		theme: patch.theme ?? existing.theme,
		density: patch.density ?? existing.density,
		defaultLanding: patch.defaultLanding ?? existing.defaultLanding,
		weekStartsOn: patch.weekStartsOn ?? existing.weekStartsOn,
		locale: patch.locale ?? existing.locale,
		notifications: { ...existing.notifications, ...(patch.notifications ?? {}) },
		quietHours: { ...existing.quietHours, ...(patch.quietHours ?? {}) },
		digest: { ...existing.digest, ...(patch.digest ?? {}) },
		notificationScope: { ...existing.notificationScope, ...(patch.notificationScope ?? {}) },
		viewState: { ...existing.viewState, ...(patch.viewState ?? {}) },
		instances: patch.instances ?? existing.instances
	};

	await db
		.insert(userPreferences)
		.values(merged)
		.onConflictDoUpdate({
			target: userPreferences.userId,
			set: {
				theme: merged.theme,
				density: merged.density,
				defaultLanding: merged.defaultLanding,
				weekStartsOn: merged.weekStartsOn,
				locale: merged.locale,
				notifications: merged.notifications,
				quietHours: merged.quietHours,
				digest: merged.digest,
				notificationScope: merged.notificationScope,
				viewState: merged.viewState,
				instances: merged.instances,
				updatedAt: sql`now()`
			}
		});

	return merged;
}

export const ALLOWED_THEMES = new Set(['dark', 'light', 'system']);
export const ALLOWED_DENSITIES = new Set(['comfortable', 'compact']);
export const ALLOWED_LANDINGS = new Set(['/week', '/tasks', '/projects', '/tickets', '/wiki']);
export const ALLOWED_LOCALES = new Set(['en', 'de']);
