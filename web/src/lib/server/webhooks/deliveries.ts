/**
 * Delivery log reads + the two admin operations on a delivery (redeliver,
 * test ping). Sending is always the worker's job; here we only flip state and
 * enqueue.
 */

import { and, desc, eq, lt } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	webhookDelivery,
	webhookDeliveryAttempt,
	webhookEvent,
	type WebhookDeliveryAttempt,
	type WebhookDeliveryStatus
} from '$lib/server/db/app.schema';
import { webhookDeliverJob } from '$lib/server/jobs/services/webhook';

export type DeliveryListItem = {
	id: string;
	eventId: string;
	eventType: string;
	status: WebhookDeliveryStatus;
	attempt: number;
	nextAttemptAt: Date | null;
	lastStatusCode: number | null;
	lastError: string | null;
	lastDurationMs: number | null;
	createdAt: Date;
	updatedAt: Date;
};

export type DeliveryDetail = DeliveryListItem & {
	payload: Record<string, unknown>;
	responseSnippet: string | null;
	attempts: WebhookDeliveryAttempt[];
};

const PAGE = 50;

export async function listDeliveries(
	subscriptionId: string,
	opts: { before?: Date | null } = {}
): Promise<{ items: DeliveryListItem[]; hasMore: boolean }> {
	const where = opts.before
		? and(
				eq(webhookDelivery.subscriptionId, subscriptionId),
				lt(webhookDelivery.createdAt, opts.before)
			)
		: eq(webhookDelivery.subscriptionId, subscriptionId);
	const rows = await db
		.select({
			id: webhookDelivery.id,
			eventId: webhookDelivery.eventId,
			eventType: webhookEvent.type,
			status: webhookDelivery.status,
			attempt: webhookDelivery.attempt,
			nextAttemptAt: webhookDelivery.nextAttemptAt,
			lastStatusCode: webhookDelivery.lastStatusCode,
			lastError: webhookDelivery.lastError,
			lastDurationMs: webhookDelivery.lastDurationMs,
			createdAt: webhookDelivery.createdAt,
			updatedAt: webhookDelivery.updatedAt
		})
		.from(webhookDelivery)
		.innerJoin(webhookEvent, eq(webhookEvent.id, webhookDelivery.eventId))
		.where(where)
		.orderBy(desc(webhookDelivery.createdAt))
		.limit(PAGE + 1);
	return { items: rows.slice(0, PAGE), hasMore: rows.length > PAGE };
}

export async function getDelivery(
	subscriptionId: string,
	deliveryId: string
): Promise<DeliveryDetail | null> {
	const [row] = await db
		.select({
			id: webhookDelivery.id,
			eventId: webhookDelivery.eventId,
			eventType: webhookEvent.type,
			payload: webhookEvent.payload,
			status: webhookDelivery.status,
			attempt: webhookDelivery.attempt,
			nextAttemptAt: webhookDelivery.nextAttemptAt,
			lastStatusCode: webhookDelivery.lastStatusCode,
			lastError: webhookDelivery.lastError,
			lastDurationMs: webhookDelivery.lastDurationMs,
			responseSnippet: webhookDelivery.responseSnippet,
			createdAt: webhookDelivery.createdAt,
			updatedAt: webhookDelivery.updatedAt
		})
		.from(webhookDelivery)
		.innerJoin(webhookEvent, eq(webhookEvent.id, webhookDelivery.eventId))
		.where(and(eq(webhookDelivery.id, deliveryId), eq(webhookDelivery.subscriptionId, subscriptionId)))
		.limit(1);
	if (!row) return null;
	const attempts = await db
		.select()
		.from(webhookDeliveryAttempt)
		.where(eq(webhookDeliveryAttempt.deliveryId, deliveryId))
		.orderBy(desc(webhookDeliveryAttempt.attempt));
	return { ...row, attempts };
}

/**
 * Manual redelivery: back to `pending` with the attempt counter kept (the log
 * stays continuous), then one fresh job. Works on any terminal or scheduled
 * delivery; the scheduled retry job, if any, will find the row not pending
 * anymore only if it already ran — otherwise both resolve to one send because
 * the worker skips rows that are no longer pending/failed.
 */
export async function redeliver(subscriptionId: string, deliveryId: string): Promise<boolean> {
	const rows = await db
		.update(webhookDelivery)
		.set({ status: 'pending', nextAttemptAt: null, lastError: null })
		.where(and(eq(webhookDelivery.id, deliveryId), eq(webhookDelivery.subscriptionId, subscriptionId)))
		.returning({ id: webhookDelivery.id, attempt: webhookDelivery.attempt });
	if (!rows.length) return false;
	await webhookDeliverJob.enqueue(
		{ deliveryId },
		{ dedupeKey: `${deliveryId}:manual:${rows[0].attempt}:${Date.now()}` }
	);
	return true;
}
