/**
 * Webhook jobs.
 *
 * `webhook.deliver` — one HTTP delivery attempt for a `webhook_delivery` row.
 * Deliberately one-shot (`maxAttempts: 1`): the Go handler owns the retry
 * schedule (1m, 5m, 30m, 2h, 12h), records each attempt in
 * `webhook_delivery_attempt`, and re-enqueues itself with `scheduledAt` when a
 * delivery fails. The engine's exponential backoff is never used for webhooks.
 *
 * `prune.webhook_deliveries` — retention for events/deliveries, driven by a
 * seeded schedule (see drizzle/0047_seed_webhook_prune_schedule.sql).
 *
 * Both handlers live in services/worker/internal/jobs/webhook.go.
 */

import { env } from '$env/dynamic/private';
import { defineJob } from '../core';
import type { PrunePayload } from './prune';

export type WebhookDeliverPayload = {
	deliveryId: string;
};

export const webhookDeliverJob = defineJob<WebhookDeliverPayload>('webhook.deliver', {
	maxAttempts: 1
});

export const pruneWebhookDeliveriesJob = defineJob<PrunePayload>('prune.webhook_deliveries');

/** Kill switch for emission. Default on; set WEBHOOKS_ENABLED=false to stop enqueuing. */
export function webhooksEnabled(): boolean {
	const v = env.WEBHOOKS_ENABLED;
	return v === undefined || v === '' || v === 'true' || v === '1';
}
