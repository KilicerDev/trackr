/**
 * Push service — the `push.send` job: one native push notification to all of a
 * user's registered devices (see `push_token` in app.schema.ts). The Go worker
 * (worker/internal/jobs/push.go) resolves the user's device tokens at send
 * time, so a token registered after enqueue still receives the send. Enqueue
 * is gated behind `PUSH_ENABLED=true`; with the flag off,
 * `sendPushFireAndForget` is a no-op, so notify() can call it unconditionally.
 */

import { env } from '$env/dynamic/private';
import { defineJob } from '../core';

/** The `push.send` payload. Mirrored by the Go handler (worker/internal/jobs/push.go). */
export type PushPayload = {
	userId: string;
	title: string;
	/** APNs alert subtitle — the entity label ("TRACK-91 — Fix the thing"). */
	subtitle?: string | null;
	body?: string | null;
	/** In-app route (e.g. `/tickets/abc`) — the app deep-links to it on tap. */
	url: string;
	/**
	 * APNs thread-id: notifications sharing it stack as one group on the
	 * lock screen. We use the entity ("ticket:<id>"), so a busy ticket
	 * coalesces instead of flooding.
	 */
	threadId?: string | null;
	/** App icon badge: the recipient's unread inbox count at enqueue time. */
	badge?: number | null;
};

export const pushJob = defineJob<PushPayload>('push.send');

export function pushEnabled(): boolean {
	return env.PUSH_ENABLED === 'true' || env.PUSH_ENABLED === '1';
}

/** Enqueue one push per recipient; no-op unless PUSH_ENABLED. */
export function sendPushFireAndForget(
	userIds: Iterable<string>,
	content: {
		title: string;
		subtitle?: string | null;
		body?: string | null;
		url: string;
		threadId?: string | null;
		badge?: number | null;
	}
): void {
	if (!pushEnabled()) return;
	for (const userId of userIds) {
		void pushJob
			.enqueue({
				userId,
				title: content.title,
				subtitle: content.subtitle ?? null,
				body: content.body ?? null,
				url: content.url,
				threadId: content.threadId ?? null,
				badge: content.badge ?? null
			})
			.catch((err) => {
				console.error('[push] enqueue failed', { userId, err });
			});
	}
}
