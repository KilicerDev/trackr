/**
 * Retention services — scheduled cleanup jobs that keep domain tables bounded.
 * Each is a pure-SQL Go handler (services/worker/internal/jobs/cleanup.go),
 * normally driven by a row in the `schedules` table. They share the
 * `{ olderThanDays }` payload shape with `prune.jobs`.
 */

import { defineJob } from '../core';
import type { PrunePayload } from './prune';

/** Delete done (accepted/expired) invitations untouched for `olderThanDays`. */
export const invitationsPruneJob = defineJob<PrunePayload>('prune.invitations');

/** Delete read in-app notifications older than `olderThanDays`. */
export const notificationsPruneJob = defineJob<PrunePayload>('prune.notifications');
