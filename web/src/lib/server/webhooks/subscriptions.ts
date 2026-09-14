/**
 * Subscription CRUD for the admin UI. Every mutation invalidates the emit
 * cache. Secrets are generated here and returned exactly once (create /
 * rotate); reads never include them — see `SubscriptionView`.
 */

import { randomBytes } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	webhookDelivery,
	webhookSubscription,
	WEBHOOK_INTERNAL_ORG,
	type WebhookDeliveryStatus,
	type WebhookSubscription
} from '$lib/server/db/app.schema';
import { isWebhookEventType, type WebhookEventType } from '$lib/webhooks/events';
import { invalidateWebhookSubscriptions } from './emit';

export type SubscriptionInput = {
	name: string;
	url: string;
	description: string | null;
	eventTypes: WebhookEventType[];
	orgIds: string[] | null;
	projectIds: string[] | null;
	assigneeUserId: string | null;
	includeInternalMessages: boolean;
};

/** Everything but the secret. */
export type SubscriptionView = Omit<WebhookSubscription, 'secret'> & { secretHint: string };

export type SubscriptionListItem = SubscriptionView & {
	lastDelivery: { status: WebhookDeliveryStatus; at: Date } | null;
	deliveryCount24h: number;
};

export function generateSecret(): string {
	return 'whsec_' + randomBytes(32).toString('base64url');
}

/** "whsec_ab12…" — enough to recognise, useless to sign with. */
export function secretHint(secret: string): string {
	return secret.slice(0, 10) + '…';
}

function toView(row: WebhookSubscription): SubscriptionView {
	const { secret, ...rest } = row;
	return { ...rest, secretHint: secretHint(secret) };
}

export function normalizeEventTypes(raw: string[]): WebhookEventType[] {
	return [...new Set(raw.filter(isWebhookEventType))];
}

/** Empty list → null (no filter). Unknown ids are the caller's problem (FK-less jsonb). */
export function normalizeIdList(raw: string[] | null | undefined): string[] | null {
	if (!raw) return null;
	const cleaned = [...new Set(raw.map((s) => s.trim()).filter(Boolean))];
	return cleaned.length ? cleaned : null;
}

export { WEBHOOK_INTERNAL_ORG };

export async function listSubscriptions(): Promise<SubscriptionListItem[]> {
	const rows = await db
		.select()
		.from(webhookSubscription)
		.orderBy(desc(webhookSubscription.createdAt));
	if (rows.length === 0) return [];

	const last = await db.execute<{
		subscription_id: string;
		status: WebhookDeliveryStatus;
		created_at: Date;
		count24h: number;
	}>(sql`
		SELECT DISTINCT ON (d.subscription_id)
			d.subscription_id, d.status, d.created_at,
			(SELECT count(*)::int FROM webhook_delivery x
			   WHERE x.subscription_id = d.subscription_id
			     AND x.created_at > now() - interval '24 hours') AS "count24h"
		FROM webhook_delivery d
		ORDER BY d.subscription_id, d.created_at DESC`);
	const byId = new Map(last.map((r) => [r.subscription_id, r]));

	return rows.map((r) => {
		const l = byId.get(r.id);
		return {
			...toView(r),
			lastDelivery: l ? { status: l.status, at: new Date(l.created_at) } : null,
			deliveryCount24h: l?.count24h ?? 0
		};
	});
}

export async function getSubscription(id: string): Promise<SubscriptionView | null> {
	const row = await db.query.webhookSubscription.findFirst({
		where: eq(webhookSubscription.id, id)
	});
	return row ? toView(row) : null;
}

/** Internal: full row incl. secret, for emitPing. */
export async function getSubscriptionRow(id: string): Promise<WebhookSubscription | null> {
	return (
		(await db.query.webhookSubscription.findFirst({ where: eq(webhookSubscription.id, id) })) ??
		null
	);
}

export async function createSubscription(
	input: SubscriptionInput,
	createdBy: string
): Promise<{ subscription: SubscriptionView; secret: string }> {
	const secret = generateSecret();
	const id = crypto.randomUUID();
	const [row] = await db
		.insert(webhookSubscription)
		.values({ id, ...input, secret, createdBy })
		.returning();
	invalidateWebhookSubscriptions();
	return { subscription: toView(row), secret };
}

export async function updateSubscription(
	id: string,
	input: SubscriptionInput
): Promise<SubscriptionView | null> {
	const [row] = await db
		.update(webhookSubscription)
		.set(input)
		.where(eq(webhookSubscription.id, id))
		.returning();
	invalidateWebhookSubscriptions();
	return row ? toView(row) : null;
}

export async function rotateSecret(id: string): Promise<string | null> {
	const secret = generateSecret();
	const rows = await db
		.update(webhookSubscription)
		.set({ secret })
		.where(eq(webhookSubscription.id, id))
		.returning({ id: webhookSubscription.id });
	invalidateWebhookSubscriptions();
	return rows.length ? secret : null;
}

/** Enable resets the failure counter so an auto-disabled hook gets a fresh run. */
export async function setSubscriptionEnabled(id: string, enabled: boolean): Promise<boolean> {
	const rows = await db
		.update(webhookSubscription)
		.set(
			enabled
				? { enabled: true, disabledReason: null, consecutiveFailures: 0 }
				: { enabled: false, disabledReason: 'manual' }
		)
		.where(eq(webhookSubscription.id, id))
		.returning({ id: webhookSubscription.id });
	invalidateWebhookSubscriptions();
	if (!enabled && rows.length) {
		// Nothing queued for a disabled hook should still go out.
		await db
			.update(webhookDelivery)
			.set({ status: 'cancelled', nextAttemptAt: null })
			.where(
				and(
					eq(webhookDelivery.subscriptionId, id),
					sql`${webhookDelivery.status} IN ('pending','failed')`
				)
			);
	}
	return rows.length > 0;
}

export async function deleteSubscription(id: string): Promise<boolean> {
	const rows = await db
		.delete(webhookSubscription)
		.where(eq(webhookSubscription.id, id))
		.returning({ id: webhookSubscription.id });
	invalidateWebhookSubscriptions();
	return rows.length > 0;
}
