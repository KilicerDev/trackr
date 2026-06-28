// Central emit helper. Every call site that creates a notification goes
// through `notify()` — it loads each recipient's preferences and fans out
// to the in-app inbox and/or email channel exactly as configured.
//
// Recipient *eligibility* is the caller's responsibility (use
// notify-recipients.ts), preferences and channel routing are ours.

import { env } from '$env/dynamic/private';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../db';
import { notification, type NotificationKind } from '../db/app.schema';
import { user as userTable } from '../db/auth.schema';
import { getPreferences } from '../preferences';
import { sendEmailFireAndForget, notificationEmail, EMAIL_PRIORITY } from '$lib/server/jobs';
import { baseLocale, isLocale, type Locale } from '$lib/paraglide/runtime';
import { plainifyMentions } from '$lib/utils/mentions';

export type NotifyContent = { title: string; body?: string | null };

export type NotifyInput = {
	kind: NotificationKind;
	recipients: Iterable<string>;
	// Caller is responsible for excluding the actor from recipients normally,
	// but we belt-and-brace it: notify() drops `actorId` from the list.
	actorId?: string | null;
	orgId?: string | null;
	// Notification text is rendered per recipient in their saved language via
	// `render(locale)`. `title`/`body` remain as a non-localized fallback for
	// callers that don't pass `render` (the renderer wins when both are given).
	render?: (locale: Locale) => NotifyContent;
	title?: string;
	body?: string | null;
	url: string;
	entity?: { type: string; id: string } | null;
	// Origin to prefix `url` with when building the email link, e.g.
	// `https://trackr.example.com`. Callers in request scope should pass
	// `event.url.origin` so links match whichever host the actor used —
	// host-based deploys can't rely on env.ORIGIN (it pins adapter-node to
	// a single host and breaks routing). Falls back to env.ORIGIN, then to
	// a relative path if neither is available.
	baseUrl?: string | null;
};

function buildUrl(path: string, baseUrl?: string | null): string {
	if (path.startsWith('http')) return path;
	const origin = (baseUrl ?? env.ORIGIN ?? '').replace(/\/$/, '');
	if (!origin) return path;
	return `${origin}${path.startsWith('/') ? '' : '/'}${path}`;
}

export async function notify(input: NotifyInput): Promise<void> {
	const recipientIds = Array.from(new Set(input.recipients)).filter(
		(id) => id && id !== input.actorId
	);
	if (recipientIds.length === 0) return;

	// Pull prefs in parallel. getPreferences merges with NOTIFICATION_DEFAULTS
	// so the channel object is always populated.
	const prefsList = await Promise.all(recipientIds.map((id) => getPreferences(id)));
	const localeOf = new Map<string, Locale>();
	const wantsInApp: string[] = [];
	const wantsEmail: string[] = [];
	for (let i = 0; i < recipientIds.length; i++) {
		const prefs = prefsList[i];
		localeOf.set(recipientIds[i], isLocale(prefs.locale) ? prefs.locale : baseLocale);
		const pref = prefs.notifications[input.kind];
		if (pref?.inApp) wantsInApp.push(recipientIds[i]);
		if (pref?.email) wantsEmail.push(recipientIds[i]);
	}

	// Render once per distinct locale; recipients sharing a language reuse it.
	const contentCache = new Map<Locale, NotifyContent>();
	const contentFor = (recipientId: string): NotifyContent => {
		const locale = localeOf.get(recipientId) ?? baseLocale;
		let content = contentCache.get(locale);
		if (!content) {
			const raw = input.render
				? input.render(locale)
				: { title: input.title ?? '', body: input.body ?? null };
			// Bodies may carry raw @[Name](id) mention tokens — flatten them to plain
			// `@Name` for the inbox row and the email (neither can render chips).
			content = { ...raw, body: raw.body ? plainifyMentions(raw.body) : (raw.body ?? null) };
			contentCache.set(locale, content);
		}
		return content;
	};

	const fullUrl = buildUrl(input.url, input.baseUrl);

	if (wantsInApp.length > 0) {
		const rows = wantsInApp.map((recipientId) => {
			const content = contentFor(recipientId);
			return {
				id: crypto.randomUUID(),
				recipientId,
				orgId: input.orgId ?? null,
				kind: input.kind,
				title: content.title,
				body: content.body ?? null,
				url: input.url,
				actorId: input.actorId ?? null,
				entityType: input.entity?.type ?? null,
				entityId: input.entity?.id ?? null
			};
		});
		await db.insert(notification).values(rows);
	}

	if (wantsEmail.length > 0) {
		const emailRows = await db
			.select({ id: userTable.id, email: userTable.email, banned: userTable.banned })
			.from(userTable)
			.where(inArray(userTable.id, wantsEmail));
		for (const u of emailRows) {
			if (u.banned) continue;
			const content = contentFor(u.id);
			sendEmailFireAndForget(
				notificationEmail({
					to: u.email,
					title: content.title,
					body: content.body,
					url: fullUrl,
					locale: localeOf.get(u.id) ?? baseLocale
				}),
				{ priority: EMAIL_PRIORITY.low }
			);
		}
	}
}

// Mark all of a recipient's unread notifications for a given entity as read.
// Called from entity detail loads so opening the page clears the bell.
export async function markEntityRead(
	recipientId: string,
	entityType: string,
	entityId: string
): Promise<void> {
	await db
		.update(notification)
		.set({ readAt: new Date() })
		.where(
			and(
				eq(notification.recipientId, recipientId),
				eq(notification.entityType, entityType),
				eq(notification.entityId, entityId),
				isNull(notification.readAt)
			)
		);
}

export async function markAllRead(recipientId: string): Promise<void> {
	await db
		.update(notification)
		.set({ readAt: new Date() })
		.where(and(eq(notification.recipientId, recipientId), isNull(notification.readAt)));
}
