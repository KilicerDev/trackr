// Central emit helper. Every call site that creates a notification goes
// through `notify()` — it loads each recipient's preferences and fans out
// to the in-app inbox and/or email channel exactly as configured.
//
// Recipient *eligibility* is the caller's responsibility (use
// notify-recipients.ts), preferences and channel routing are ours.

import { env } from '$env/dynamic/private';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../db';
import { notification, type NotificationKind } from '../db/app.schema';
import { user as userTable } from '../db/auth.schema';
import { getPreferences } from '../preferences';
import {
	sendEmailFireAndForget,
	sendPushFireAndForget,
	notificationEmail,
	plainNotificationEmail,
	EMAIL_PRIORITY,
	type NotificationEmailContent
} from '$lib/server/jobs';
import { baseLocale, isLocale, type Locale } from '$lib/paraglide/runtime';
import { plainifyMentions } from '$lib/utils/mentions';
import { plainifyRefs } from '$lib/utils/refs';
import { publishEvent } from '../events';
import { enqueueDigestItems, isWithinQuietHours } from './digest';

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
	// Structured email content, rendered per recipient locale. When present,
	// the email channel sends the rich card (eyebrow / heading / meta rows /
	// quote / entity-specific CTA) with a compact `[Trackr] REF · Event`
	// subject; without it, the legacy flat title/body email goes out.
	// The in-app inbox and push always use `render`/`title` regardless.
	email?: (locale: Locale) => NotificationEmailContent;
	entity?: { type: string; id: string } | null;
	// For the broad audience kinds (see BROAD_SCOPED_KINDS), the ids of users
	// directly involved (assignees, customer, creator, thread followers). Lets a
	// see-all recipient's 'participating' scope keep only the ones they're on.
	participants?: Iterable<string>;
	// Origin to prefix `url` with when building the email link, e.g.
	// `https://trackr.example.com`. Callers in request scope should pass
	// `event.url.origin` so links match whichever host the actor used —
	// host-based deploys can't rely on env.ORIGIN (it pins adapter-node to
	// a single host and breaks routing). Falls back to env.ORIGIN, then to
	// a relative path if neither is available.
	baseUrl?: string | null;
};

// Kinds that fan out to a wide "everyone who can see it" audience — the ones a
// see-all user's per-surface scope can narrow. Assignment and @-mention kinds
// are intentionally excluded: they're always personally relevant.
const BROAD_SCOPED_KINDS = new Set<NotificationKind>([
	'ticketCreated',
	'ticketMessage',
	'ticketStatusChanged',
	'chatMessage'
]);

function buildUrl(path: string, baseUrl?: string | null): string {
	if (path.startsWith('http')) return path;
	const origin = (baseUrl ?? env.ORIGIN ?? '').replace(/\/$/, '');
	if (!origin) return path;
	return `${origin}${path.startsWith('/') ? '' : '/'}${path}`;
}

// ---------------------------------------------------------------------------
// Push composition. Inbox strings are dense one-liners ("New comment on
// TRACK-12: Fix the thing") — fine in a list, bad as a bold lock-screen line.
// Every kind is therefore recomposed into the APNs title / subtitle / body
// triple: the event phrase becomes the title, the entity label the subtitle,
// and the message excerpt (markdown flattened, truncated) the body. The split
// keys off the two separators every inbox string uses (" — " and ": "), in
// both locales, so it applies uniformly to all notification kinds.

const PUSH_BODY_MAX = 240;

/** Flatten markdown syntax to plain text for the lock screen. */
function plainifyMarkdown(text: string): string {
	return text
		.replace(/```[a-zA-Z0-9]*\n?([\s\S]*?)```/g, '$1')
		.replace(/`([^`]*)`/g, '$1')
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/(\*\*|__)([\s\S]*?)\1/g, '$2')
		.replace(/~~([\s\S]*?)~~/g, '$1')
		.replace(/^#{1,6}\s+/gm, '')
		.replace(/^>\s?/gm, '')
		.replace(/^[-*+]\s+/gm, '')
		.replace(/\n{2,}/g, '\n')
		.trim();
}

function pushExcerpt(text: string): string | null {
	const flat = plainifyMarkdown(text);
	if (!flat) return null;
	if (flat.length <= PUSH_BODY_MAX) return flat;
	return flat.slice(0, PUSH_BODY_MAX - 1).trimEnd() + '…';
}

export function composePush(content: NotifyContent): {
	title: string;
	subtitle: string | null;
	body: string | null;
} {
	let title = content.title;
	let subtitle: string | null = null;
	// Prefer the em-dash separator ("Assigned to you: TRACK-91 — Fix the
	// thing" keeps the ref in the title); fall back to the first ": " for the
	// colon-style strings ("New comment on TRACK-12: Fix the thing").
	const em = title.indexOf(' — ');
	if (em > 0) {
		subtitle = title.slice(em + 3).trim() || null;
		title = title.slice(0, em).trim();
	} else {
		const colon = title.indexOf(': ');
		if (colon > 0) {
			subtitle = title.slice(colon + 2).trim() || null;
			title = title.slice(0, colon).trim();
		}
	}
	const body = content.body ? pushExcerpt(content.body) : null;
	return { title, subtitle, body };
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
	const wantsEmail: string[] = []; // instant email, sent now
	const wantsDigest: string[] = []; // batched into the periodic rollup email
	const now = new Date();
	const isBroadKind = BROAD_SCOPED_KINDS.has(input.kind);
	const surface: 'tickets' | 'chat' = input.kind.startsWith('chat') ? 'chat' : 'tickets';
	const participants = new Set(input.participants ?? []);
	for (let i = 0; i < recipientIds.length; i++) {
		const prefs = prefsList[i];
		localeOf.set(recipientIds[i], isLocale(prefs.locale) ? prefs.locale : baseLocale);

		// Per-surface scope for see-all users: 'mentions' drops these broad kinds
		// entirely (they still get the *Mentioned kinds), 'participating' keeps
		// only events they're actually involved in. 'all' is a no-op.
		if (isBroadKind) {
			const scope = prefs.notificationScope[surface];
			if (scope === 'mentions') continue;
			if (scope === 'participating' && !participants.has(recipientIds[i])) continue;
		}

		const pref = prefs.notifications[input.kind];
		if (pref?.inApp) wantsInApp.push(recipientIds[i]);
		// Email routing by delivery mode. Instant mail is deferred into the digest
		// queue when the recipient is inside their quiet hours, so it's held rather
		// than dropped.
		const mode = pref?.email ?? 'off';
		if (mode === 'digest') wantsDigest.push(recipientIds[i]);
		else if (mode === 'instant') {
			if (isWithinQuietHours(prefs.quietHours, now)) wantsDigest.push(recipientIds[i]);
			else wantsEmail.push(recipientIds[i]);
		}
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
			// Bodies may carry raw @[Name](id) mention and ~[ID](type:id) ref tokens —
			// flatten to plain `@Name`/`SIWEB-15` for the inbox row and the email
			// (neither can render chips).
			content = {
				...raw,
				body: raw.body ? plainifyRefs(plainifyMentions(raw.body)) : (raw.body ?? null)
			};
			contentCache.set(locale, content);
		}
		return content;
	};

	const fullUrl = buildUrl(input.url, input.baseUrl);

	// Live invalidation for connected clients (SSE). The entity hint goes to
	// every eligible recipient — including scope-filtered ones, who can still
	// *see* the entity even when they've muted broad notifications about it.
	// Callers persist their domain rows before notify(), so a refetch triggered
	// by this event always observes the new state.
	if (input.entity) {
		publishEvent(recipientIds, {
			type: 'entity',
			entityType: input.entity.type,
			entityId: input.entity.id
		});
	}

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
		publishEvent(wantsInApp, { type: 'inbox' });

		// Native push mirrors the in-app channel: whoever gets an inbox row gets
		// a push to their registered devices (no-op until PUSH_ENABLED); content
		// is per-locale so enqueue per recipient. composePush() reshapes the
		// inbox one-liner into the title/subtitle/body triple for the lock
		// screen. The entity keys the APNs thread-id so a busy ticket stacks
		// instead of flooding, and the unread count rides along as the badge.
		const unreadRows = await db
			.select({
				recipientId: notification.recipientId,
				count: sql<number>`count(*)::int`
			})
			.from(notification)
			.where(and(inArray(notification.recipientId, wantsInApp), isNull(notification.readAt)))
			.groupBy(notification.recipientId);
		const badgeOf = new Map(unreadRows.map((r) => [r.recipientId, r.count]));
		const threadId = input.entity ? `${input.entity.type}:${input.entity.id}` : null;
		for (const recipientId of wantsInApp) {
			const push = composePush(contentFor(recipientId));
			sendPushFireAndForget([recipientId], {
				title: push.title,
				subtitle: push.subtitle,
				body: push.body,
				url: input.url,
				threadId,
				badge: badgeOf.get(recipientId) ?? null
			});
		}
	}

	if (wantsEmail.length > 0) {
		const emailRows = await db
			.select({ id: userTable.id, email: userTable.email, banned: userTable.banned })
			.from(userTable)
			.where(inArray(userTable.id, wantsEmail));
		// Structured email content per distinct locale (mirrors contentFor).
		const emailContentCache = new Map<Locale, NotificationEmailContent>();
		const emailContentFor = (locale: Locale): NotificationEmailContent | null => {
			if (!input.email) return null;
			let c = emailContentCache.get(locale);
			if (!c) {
				c = input.email(locale);
				emailContentCache.set(locale, c);
			}
			return c;
		};
		// Footer settings link needs an absolute URL; skip it when no origin is
		// known (the relative path would 404 out of a mail client).
		const settingsUrl = buildUrl('/me/settings', input.baseUrl);
		for (const u of emailRows) {
			if (u.banned) continue;
			const locale = localeOf.get(u.id) ?? baseLocale;
			const structured = emailContentFor(locale);
			const payload = structured
				? await notificationEmail({
						to: u.email,
						content: {
							...structured,
							quote: structured.quote
								? plainifyRefs(plainifyMentions(structured.quote))
								: structured.quote
						},
						url: fullUrl,
						settingsUrl: settingsUrl.startsWith('http') ? settingsUrl : null,
						locale
					})
				: await plainNotificationEmail({
						to: u.email,
						title: contentFor(u.id).title,
						body: contentFor(u.id).body,
						url: fullUrl,
						locale
					});
			sendEmailFireAndForget(payload, { priority: EMAIL_PRIORITY.low });
		}
	}

	// Digest recipients: park the rendered notification in the queue. The Go
	// worker's `notify.digest` job drains and emails these on the user's cadence.
	if (wantsDigest.length > 0) {
		await enqueueDigestItems(
			wantsDigest.map((id) => {
				const content = contentFor(id);
				return {
					userId: id,
					orgId: input.orgId ?? null,
					kind: input.kind,
					title: content.title,
					body: content.body ?? null,
					url: fullUrl
				};
			})
		);
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
	// Reading on one device clears the badge on the user's others.
	publishEvent([recipientId], { type: 'inbox' });
}

// Mark a single notification read. Scoped to the recipient so a user can only
// ever clear their own rows, even if they pass someone else's notification id.
export async function markRead(recipientId: string, notificationId: string): Promise<void> {
	await db
		.update(notification)
		.set({ readAt: new Date() })
		.where(
			and(
				eq(notification.id, notificationId),
				eq(notification.recipientId, recipientId),
				isNull(notification.readAt)
			)
		);
	publishEvent([recipientId], { type: 'inbox' });
}

export async function markAllRead(recipientId: string): Promise<void> {
	await db
		.update(notification)
		.set({ readAt: new Date() })
		.where(and(eq(notification.recipientId, recipientId), isNull(notification.readAt)));
	publishEvent([recipientId], { type: 'inbox' });
}
