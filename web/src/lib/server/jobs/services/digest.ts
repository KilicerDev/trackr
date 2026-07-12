/**
 * Notification digest service — the `notify.digest` job.
 *
 * Unlike most jobs this one is driven purely by a row in `schedules` (every
 * 15m): the Go handler (services/worker/internal/jobs/digest.go) scans the
 * `notification_digest_item` queue, decides per user whether their hourly/daily
 * window is due, and enqueues one rolled-up `mail.send` per due user. The
 * payload is empty — all state lives in the queue + each user's `digest` prefs.
 */

import { defineJob } from '../core';

export type NotifyDigestPayload = Record<string, never>;

export const notifyDigestJob = defineJob<NotifyDigestPayload>('notify.digest');
