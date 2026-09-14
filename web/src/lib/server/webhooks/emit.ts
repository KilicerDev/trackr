/**
 * Event emission. `emitWebhookEvent()` is called from the same write paths
 * that log activity and send notifications. It is fire-and-forget and never
 * throws: a webhook problem must not fail the user's request.
 *
 * Matching happens here (subscriptions are few and cached); the HTTP work is
 * the Go worker's (`webhook.deliver`), one job per delivery.
 */

import { env } from '$env/dynamic/private';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	webhookDelivery,
	webhookEvent,
	webhookSubscription,
	WEBHOOK_INTERNAL_ORG,
	type WebhookSubscription
} from '$lib/server/db/app.schema';
import { webhookDeliverJob, webhooksEnabled } from '$lib/server/jobs/services/webhook';
import {
	WEBHOOK_BODY_MAX,
	WEBHOOK_PAYLOAD_VERSION,
	WEBHOOK_PING_EVENT,
	type WebhookEventType
} from '$lib/webhooks/events';

export type WebhookActor = { id: string; name: string } | null;

export type EmitInput = {
	type: WebhookEventType;
	/** Client org the entity belongs to; null/undefined = internal work. */
	orgId?: string | null;
	projectId?: string | null;
	actor?: WebhookActor;
	/** Users the event is "about" (assignees) — feeds the assignee filter. */
	assigneeIds?: string[];
	/** Internal-only content (ticket internal notes) — only sent when opted in. */
	internal?: boolean;
	/** The `data` object of the payload. Build it with the helpers in payloads.ts. */
	data: Record<string, unknown>;
	/** Request origin for absolute URLs in the payload; falls back to env.ORIGIN. */
	origin?: string | null;
};

// ---------------------------------------------------------------------------
// Subscription cache. Single-replica assumption (same as the permission cache);
// writes call `invalidateWebhookSubscriptions()`.

const CACHE_TTL_MS = 30_000;
let cache: { at: number; rows: WebhookSubscription[] } | null = null;

async function activeSubscriptions(): Promise<WebhookSubscription[]> {
	const now = Date.now();
	if (cache && now - cache.at < CACHE_TTL_MS) return cache.rows;
	const rows = await db
		.select()
		.from(webhookSubscription)
		.where(eq(webhookSubscription.enabled, true));
	cache = { at: now, rows };
	return rows;
}

export function invalidateWebhookSubscriptions(): void {
	cache = null;
}

// ---------------------------------------------------------------------------

export function absoluteUrl(path: string, origin?: string | null): string {
	if (path.startsWith('http')) return path;
	const base = (origin ?? env.ORIGIN ?? '').replace(/\/$/, '');
	return base ? `${base}${path.startsWith('/') ? '' : '/'}${path}` : path;
}

export function truncateBody(body: string | null | undefined): string | null {
	if (!body) return null;
	return body.length > WEBHOOK_BODY_MAX ? body.slice(0, WEBHOOK_BODY_MAX - 1) + '…' : body;
}

export function matches(sub: WebhookSubscription, input: EmitInput): boolean {
	if (!sub.eventTypes.includes(input.type)) return false;
	if (input.internal && !sub.includeInternalMessages) return false;
	if (sub.orgIds && sub.orgIds.length > 0) {
		const key = input.orgId ?? WEBHOOK_INTERNAL_ORG;
		if (!sub.orgIds.includes(key)) return false;
	}
	if (sub.projectIds && sub.projectIds.length > 0) {
		// A project filter only ever matches project-bound events.
		if (!input.projectId || !sub.projectIds.includes(input.projectId)) return false;
	}
	if (sub.assigneeUserId) {
		if (!input.assigneeIds?.includes(sub.assigneeUserId)) return false;
	}
	return true;
}

function buildPayload(
	id: string,
	input: EmitInput | { type: string; data: Record<string, unknown> }
) {
	const full = input as EmitInput;
	return {
		id,
		type: input.type,
		version: WEBHOOK_PAYLOAD_VERSION,
		createdAt: new Date().toISOString(),
		organizationId: full.orgId ?? null,
		projectId: full.projectId ?? null,
		actor: full.actor ? { id: full.actor.id, name: full.actor.name } : null,
		data: input.data
	};
}

/**
 * Match, persist and enqueue. Returns the number of deliveries created.
 * Prefer `emitWebhookEvent` (fire-and-forget) from request handlers.
 */
export async function emitWebhookEventNow(input: EmitInput): Promise<number> {
	if (!webhooksEnabled()) return 0;
	const subs = (await activeSubscriptions()).filter((s) => matches(s, input));
	if (subs.length === 0) return 0;

	const eventId = crypto.randomUUID();
	const payload = buildPayload(eventId, input);
	const deliveries = subs.map((s) => ({
		id: crypto.randomUUID(),
		subscriptionId: s.id,
		eventId
	}));

	await db.transaction(async (tx) => {
		await tx.insert(webhookEvent).values({
			id: eventId,
			type: input.type,
			orgId: input.orgId ?? null,
			projectId: input.projectId ?? null,
			actorId: input.actor?.id ?? null,
			payload
		});
		await tx.insert(webhookDelivery).values(deliveries);
		for (const d of deliveries) {
			await webhookDeliverJob.enqueueTx(tx, { deliveryId: d.id }, { dedupeKey: `${d.id}:1` });
		}
	});
	return deliveries.length;
}

/** Fire-and-forget emit; logs and swallows every error. */
export function emitWebhookEvent(input: EmitInput): void {
	void emitWebhookEventNow(input).catch((err) => {
		console.error('[webhooks] emit failed', { type: input.type, err });
	});
}

/**
 * "Send test event": one synthetic `ping` delivery to a single subscription,
 * bypassing filters. Returns the delivery id so the UI can link to it.
 */
export async function emitPing(sub: WebhookSubscription, actor: WebhookActor): Promise<string> {
	const eventId = crypto.randomUUID();
	const deliveryId = crypto.randomUUID();
	const payload = buildPayload(eventId, {
		type: WEBHOOK_PING_EVENT,
		data: { webhook: { id: sub.id, name: sub.name }, message: 'Hello from Trackr' }
	});
	payload.actor = actor ? { id: actor.id, name: actor.name } : null;
	await db.transaction(async (tx) => {
		await tx.insert(webhookEvent).values({
			id: eventId,
			type: WEBHOOK_PING_EVENT,
			actorId: actor?.id ?? null,
			payload
		});
		await tx.insert(webhookDelivery).values({ id: deliveryId, subscriptionId: sub.id, eventId });
		await webhookDeliverJob.enqueueTx(tx, { deliveryId }, { dedupeKey: `${deliveryId}:1` });
	});
	return deliveryId;
}
