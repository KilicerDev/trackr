/**
 * Push service — the `push.send` job: one native push notification to all of a
 * user's registered devices (see `push_token` in app.schema.ts).
 *
 * GROUNDWORK ONLY for now: the Go worker has no `push.send` handler yet
 * (FCM/APNs is a planned follow-up), so enqueueing is gated behind
 * `PUSH_ENABLED=true`. With the flag off (the default) `sendPushFireAndForget`
 * is a no-op — notify() can call it unconditionally today, and flipping the
 * flag once the worker handler + Firebase credentials exist turns push on
 * without touching any call site. The worker resolves the user's device
 * tokens itself so a token registered after enqueue still receives the send.
 */

import { env } from '$env/dynamic/private';
import { defineJob } from '../core';

/** The `push.send` payload. Mirror in the future Go handler. */
export type PushPayload = {
	userId: string;
	title: string;
	body?: string | null;
	/** In-app route (e.g. `/tickets/abc`) — the app deep-links to it on tap. */
	url: string;
};

export const pushJob = defineJob<PushPayload>('push.send');

export function pushEnabled(): boolean {
	return env.PUSH_ENABLED === 'true' || env.PUSH_ENABLED === '1';
}

/** Enqueue one push per recipient; no-op unless PUSH_ENABLED. */
export function sendPushFireAndForget(
	userIds: Iterable<string>,
	content: { title: string; body?: string | null; url: string }
): void {
	if (!pushEnabled()) return;
	for (const userId of userIds) {
		void pushJob
			.enqueue({ userId, title: content.title, body: content.body ?? null, url: content.url })
			.catch((err) => {
				console.error('[push] enqueue failed', { userId, err });
			});
	}
}
