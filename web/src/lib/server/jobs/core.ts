/**
 * Job queue — low-level core.
 *
 * `createJob` is the single, generic primitive: it inserts one job row of an
 * arbitrary type + payload. Everything else builds on it — most callers go
 * through a typed job **definition** (`defineJob`, see `./services/*`) rather
 * than calling `createJob` with a raw string.
 *
 * The queue is a table in the app database, so a job can be created inside the
 * same `db.transaction` as the business write it relates to (`createJobTx` /
 * `definition.enqueueTx`): the job only becomes visible to a worker if that
 * transaction commits.
 */

import { sql, eq, desc, inArray, and } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { jobs, type Job } from '$lib/server/db/jobs.schema';

/** Default attempts before a job is marked `failed` (also the column default). */
const DEFAULT_MAX_ATTEMPTS = 5;

/** A drizzle handle that can run queries — the top-level `db` or a transaction. */
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Executor = typeof db | DbTransaction;

export type EnqueueOptions = {
	/** Total attempts before the job is marked `failed`. Default: 5. */
	maxAttempts?: number;
	/** Claim ordering: higher is claimed sooner. Default: 0 (no priority). */
	priority?: number;
	/** Earliest time the job may run. Default: now (delayed jobs set this ahead). */
	scheduledAt?: Date;
	/**
	 * Idempotency key. While set, at most one unfinished (queued/running) job may
	 * exist per (type, dedupeKey); a conflicting insert is suppressed (returns null).
	 */
	dedupeKey?: string;
};

/**
 * Insert one job of an arbitrary `type` carrying `payload`. Returns the new job
 * id, or `null` when a `dedupeKey` conflict suppressed it.
 *
 * Prefer a typed definition (`defineJob`) over calling this with a raw string —
 * `createJob` is the escape hatch / building block.
 */
export function createJob<P>(
	type: string,
	payload: P,
	options?: EnqueueOptions
): Promise<string | null> {
	return createJobOn(db, type, payload, options);
}

/** Transactional `createJob` — pass `db` or a tx so the job commits with your write. */
export function createJobTx<P>(
	tx: Executor,
	type: string,
	payload: P,
	options?: EnqueueOptions
): Promise<string | null> {
	return createJobOn(tx, type, payload, options);
}

async function createJobOn<P>(
	executor: Executor,
	type: string,
	payload: P,
	options: EnqueueOptions = {}
): Promise<string | null> {
	const rows = await executor
		.insert(jobs)
		.values({
			type,
			payload,
			maxAttempts: options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
			priority: options.priority ?? 0,
			// undefined keys are omitted → column defaults (scheduled_at → now(), dedupe_key → null).
			scheduledAt: options.scheduledAt,
			dedupeKey: options.dedupeKey
		})
		// The only unique constraint is the partial dedupe index; a conflict there
		// means an unfinished job with this key already exists.
		.onConflictDoNothing()
		.returning({ id: jobs.id });

	return rows[0]?.id ?? null;
}

/**
 * A typed job definition: binds a job `type` to default options and exposes a
 * typed producer. Create one per job domain (see `./services/mail.ts`):
 *
 *   export const mailJob = defineJob<MailPayload>('mail.send', { maxAttempts: 5 });
 *   await mailJob.enqueue({ to, subject, text });
 */
export type JobDefinition<P> = {
	readonly type: string;
	/** Create this job (non-transactional). */
	enqueue(payload: P, options?: EnqueueOptions): Promise<string | null>;
	/** Create this job inside an existing transaction. */
	enqueueTx(tx: Executor, payload: P, options?: EnqueueOptions): Promise<string | null>;
};

export function defineJob<P>(type: string, defaults: EnqueueOptions = {}): JobDefinition<P> {
	return {
		type,
		enqueue: (payload, options) => createJobOn(db, type, payload, { ...defaults, ...options }),
		enqueueTx: (tx, payload, options) => createJobOn(tx, type, payload, { ...defaults, ...options })
	};
}

// --- Reading & operating on jobs (for the admin UI) ------------------------

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type JobView = {
	id: string;
	type: string;
	status: JobStatus;
	priority: number;
	attempts: number;
	maxAttempts: number;
	lastError: string | null;
	result: Record<string, unknown> | null;
	enqueuedAt: Date;
	updatedAt: Date;
};

export type ListJobsOptions = {
	limit?: number;
	status?: JobStatus;
};

/** Most recent jobs, newest first. */
export async function listJobs(options: ListJobsOptions = {}): Promise<JobView[]> {
	const limit = Math.min(options.limit ?? 50, 200);
	const rows = await db
		.select()
		.from(jobs)
		.where(options.status ? eq(jobs.status, options.status) : undefined)
		.orderBy(desc(jobs.createdAt))
		.limit(limit);

	return rows.map(toView);
}

/** Count jobs grouped by status, for the admin queue-health summary. */
export async function countJobsByStatus(): Promise<Record<JobStatus, number>> {
	const rows = await db
		.select({ status: jobs.status, count: sql<number>`count(*)::int` })
		.from(jobs)
		.groupBy(jobs.status);

	const counts: Record<JobStatus, number> = {
		queued: 0,
		running: 0,
		succeeded: 0,
		failed: 0,
		cancelled: 0
	};
	for (const row of rows) counts[row.status] = row.count;
	return counts;
}

/**
 * Cancel a queued or running job. A queued job is simply never claimed; a running
 * worker observes the status change on its next heartbeat and aborts the handler.
 * Returns true if a job was transitioned.
 */
export async function cancelJob(id: string): Promise<boolean> {
	const rows = await db
		.update(jobs)
		.set({ status: 'cancelled', finishedAt: new Date() })
		.where(and(eq(jobs.id, id), inArray(jobs.status, ['queued', 'running'])))
		.returning({ id: jobs.id });
	return rows.length > 0;
}

/**
 * Re-queue a terminal (succeeded/failed/cancelled) job for a fresh run: resets the
 * attempt counter and clears the previous outcome. Returns true if re-queued.
 */
export async function retryJob(id: string): Promise<boolean> {
	const rows = await db
		.update(jobs)
		.set({
			status: 'queued',
			attempt: 0,
			error: null,
			result: null,
			scheduledAt: new Date(),
			startedAt: null,
			finishedAt: null,
			lastHeartbeatAt: null
		})
		.where(and(eq(jobs.id, id), inArray(jobs.status, ['succeeded', 'failed', 'cancelled'])))
		.returning({ id: jobs.id });
	return rows.length > 0;
}

function toView(row: Job): JobView {
	return {
		id: row.id,
		type: row.type,
		status: row.status,
		priority: row.priority,
		attempts: row.attempt,
		maxAttempts: row.maxAttempts,
		lastError: row.error,
		result: row.result as Record<string, unknown> | null,
		enqueuedAt: row.createdAt,
		updatedAt: row.updatedAt
	};
}
