import { eq, sql } from 'drizzle-orm';
import { db } from './db';
import { userPreferences, type NotificationPrefs, type UserPreferences } from './db/app.schema';

export const PREF_DEFAULTS = {
	theme: 'dark' as const,
	density: 'comfortable' as const,
	defaultLanding: '/week',
	weekStartsOn: 1,
	locale: 'en'
};

export const NOTIFICATION_DEFAULTS: Required<NotificationPrefs> = {
	mentioned: { email: true, inApp: true },
	taskAssigned: { email: true, inApp: true },
	taskMentioned: { email: true, inApp: true },
	taskCommented: { email: false, inApp: true },
	taskStatusChanged: { email: false, inApp: true },
	taskDueSoon: { email: true, inApp: true },
	ticketCreated: { email: true, inApp: true },
	ticketAssigned: { email: true, inApp: true },
	ticketMessage: { email: true, inApp: true },
	chatMessage: { email: false, inApp: true },
	wikiUpdated: { email: false, inApp: false }
};

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
			viewState: {}
		};
	}

	return {
		userId: row.userId,
		theme: row.theme,
		density: row.density,
		defaultLanding: row.defaultLanding,
		weekStartsOn: row.weekStartsOn,
		locale: row.locale,
		notifications: { ...NOTIFICATION_DEFAULTS, ...(row.notifications ?? {}) },
		viewState: row.viewState ?? {}
	};
}

export type PreferencePatch = Partial<{
	theme: string;
	density: string;
	defaultLanding: string;
	weekStartsOn: number;
	locale: string;
	notifications: NotificationPrefs;
	viewState: Record<string, unknown>;
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
		viewState: { ...existing.viewState, ...(patch.viewState ?? {}) }
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
				viewState: merged.viewState,
				updatedAt: sql`now()`
			}
		});

	return merged;
}

export const ALLOWED_THEMES = new Set(['dark', 'light', 'system']);
export const ALLOWED_DENSITIES = new Set(['comfortable', 'compact']);
export const ALLOWED_LANDINGS = new Set(['/week', '/tasks', '/projects', '/tickets', '/wiki']);
export const ALLOWED_LOCALES = new Set(['en', 'de']);
