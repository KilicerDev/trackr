/**
 * Retention service — the `prune.jobs` job: deletes terminal jobs older
 * than `olderThanDays`. Usually driven by a row in the `schedules` table (see
 * web/docs/jobs.md), but the definition lets you enqueue it directly too. The Go
 * handler does the deletion (services/worker/internal/jobs/prune.go).
 */

import { defineJob } from '../core';

export type PrunePayload = { olderThanDays: number };

export const pruneJob = defineJob<PrunePayload>('prune.jobs');
