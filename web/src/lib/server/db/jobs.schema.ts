/**
 * Background-job queue + scheduler tables.
 *
 * The job system runs entirely on Postgres (no Redis): `/web` enqueues a row
 * into `jobs` — transactionally, in the same tx as the related business write —
 * and the Go worker claims it with `SELECT ... FOR UPDATE SKIP LOCKED`. The Go
 * scheduler reads `schedules` and enqueues due jobs. See web/docs/jobs.md and
 * services/README.md.
 *
 * Timestamps here are `timestamptz` (withTimezone) — unlike the bare `timestamp`
 * used elsewhere — because the queue compares them against `now()` for claiming
 * and scheduling, where the timezone must be unambiguous.
 */

import { sql } from 'drizzle-orm';
import {
	pgTable,
	text,
	timestamp,
	jsonb,
	integer,
	boolean,
	index,
	uniqueIndex,
	check
} from 'drizzle-orm/pg-core';

/** The terminal + in-flight states a job moves through. */
export const JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const;

/**
 * The queue. One row per unit of background work.
 *
 *   queued → running → succeeded
 *                    ↘ failed → (retry) → queued
 *                    ↘ cancelled
 */
export const jobs = pgTable(
	'jobs',
	{
		id: text('id')
			.primaryKey()
			.default(sql`(gen_random_uuid())::text`),
		/** Handler key, e.g. "mail.send". Matches a Go handler + a JobPayloads entry. */
		type: text('type').notNull(),
		/** Typed against the JobPayloads contract in $lib/server/jobs. */
		payload: jsonb('payload').notNull(),
		status: text('status', { enum: JOB_STATUSES }).notNull().default('queued'),
		/** Number of times this job has been claimed and run. */
		attempt: integer('attempt').notNull().default(0),
		maxAttempts: integer('max_attempts').notNull().default(5),
		/** Higher is claimed sooner; default 0 = no priority. Leads the claim ordering. */
		priority: integer('priority').notNull().default(0),
		/** Claim gate + retry-backoff target: a job is claimable when scheduled_at <= now(). */
		scheduledAt: timestamp('scheduled_at', { withTimezone: true }).defaultNow().notNull(),
		startedAt: timestamp('started_at', { withTimezone: true }),
		finishedAt: timestamp('finished_at', { withTimezone: true }),
		/** Updated by the running worker; the reaper re-queues jobs whose heartbeat went stale. */
		lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
		error: text('error'),
		result: jsonb('result'),
		/**
		 * Optional idempotency key. While set, at most one unfinished (queued/running)
		 * job may exist per (type, dedupe_key) — the scheduler's overlap guard.
		 */
		dedupeKey: text('dedupe_key'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull()
	},
	(table) => [
		check(
			'jobs_status_check',
			sql`status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')`
		),
		// Hot path: the worker's claim query — highest priority first, then oldest.
		index('jobs_claim_idx')
			.on(table.priority.desc(), table.scheduledAt)
			.where(sql`status = 'queued'`),
		// The reaper scans running jobs by heartbeat age.
		index('jobs_running_heartbeat_idx')
			.on(table.lastHeartbeatAt)
			.where(sql`status = 'running'`),
		// Overlap guard: at most one unfinished job per (type, dedupe_key).
		uniqueIndex('jobs_dedupe_idx')
			.on(table.type, table.dedupeKey)
			.where(sql`dedupe_key is not null and status in ('queued', 'running')`),
		// Admin list ordering/filtering.
		index('jobs_status_created_idx').on(table.status, table.createdAt)
	]
);

/**
 * The schedule store. Each row is a recurring source the Go scheduler turns into
 * jobs: when `next_run_at <= now()` it enqueues a `job_type` job carrying
 * `payload`, then advances `next_run_at` by `interval`. Edit rows at runtime to
 * add, pause (`enabled = false`), or retune sources — no redeploy.
 */
export const schedules = pgTable(
	'schedules',
	{
		id: text('id')
			.primaryKey()
			.default(sql`(gen_random_uuid())::text`),
		/** The `type` written into the enqueued job. */
		jobType: text('job_type').notNull(),
		/** The payload written into the enqueued job. */
		payload: jsonb('payload').notNull().default({}),
		/** A Go-parseable duration string, e.g. "5m", "1h", "24h". */
		interval: text('interval').notNull(),
		nextRunAt: timestamp('next_run_at', { withTimezone: true }).defaultNow().notNull(),
		lastRunAt: timestamp('last_run_at', { withTimezone: true }),
		/** Pause a schedule without deleting it. */
		enabled: boolean('enabled').notNull().default(true),
		/** Optional dedupe_key template carried into each enqueued job (overlap guard). */
		dedupeKey: text('dedupe_key'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull()
	},
	(table) => [
		index('schedules_due_idx')
			.on(table.nextRunAt)
			.where(sql`enabled`)
	]
);

export type Job = typeof jobs.$inferSelect;
export type Schedule = typeof schedules.$inferSelect;
