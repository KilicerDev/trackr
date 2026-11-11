/**
 * Recurring tasks: series management (set up / edit / pause / stop from a
 * task) and the runner that turns due series into tasks.
 *
 * Flow: a `schedules` row enqueues `tasks.recur` every few minutes → the Go
 * worker sees a due series and POSTs /api/internal/recurring-tasks/run →
 * `runDueRecurrences` here creates the tasks with the same createTask + side
 * effects (activity, webhooks, notifications, audit) as the web create action.
 * The rule arithmetic is in $lib/recurrence.
 */

import { timingSafeEqual } from 'node:crypto';
import { error } from '@sveltejs/kit';
import { and, asc, eq, gt, isNotNull, isNull, lte, notInArray, or } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from './db';
import { project, task, taskAssignee, taskPlanning, taskRecurrence } from './db/app.schema';
import { user } from './db/auth.schema';
import { internalSecret } from './db/jobs.schema';
import { createTask } from './tasks';
import { can, deriveIsAdmin, loadMemberships } from './permissions';
import { emitWebhookEvent, taskSnapshot } from './webhooks';
import { notifyTaskAssigned } from './notify/events/task';
import { recordAudit } from './audit';
import {
	addDays,
	formatDate,
	nextOccurrence,
	zonedDate,
	zonedInstant,
	type RecurrenceSchedule,
	type RecurrenceSeriesDTO
} from '$lib/recurrence';

// ── DTO ──────────────────────────────────────────────────────────────────────

export type { RecurrenceSeriesDTO };

type SeriesRow = typeof taskRecurrence.$inferSelect;

function scheduleOf(r: SeriesRow): RecurrenceSchedule {
	return {
		rule: r.rule,
		time: r.time,
		timezone: r.timezone,
		startsOn: r.startsOn,
		endsOn: r.endsOn
	};
}

async function toDTO(r: SeriesRow): Promise<RecurrenceSeriesDTO> {
	const [owner] = r.createdBy
		? await db.select({ id: user.id, name: user.name }).from(user).where(eq(user.id, r.createdBy))
		: [];
	return {
		id: r.id,
		schedule: scheduleOf(r),
		dueOffsetDays: r.dueOffsetDays,
		nextRunAt: r.nextRunAt?.toISOString() ?? null,
		lastRunAt: r.lastRunAt?.toISOString() ?? null,
		paused: !!r.pausedAt,
		pausedReason: r.pausedReason,
		owner: owner ?? null,
		templateTitle: r.title
	};
}

// ── Series management (request-scoped) ───────────────────────────────────────

type TaskTarget = {
	id: string;
	projectId: string;
	projectKey: string;
	createdBy: string | null;
	recurrenceId: string | null;
};

async function loadTarget(taskId: string): Promise<TaskTarget | null> {
	const [row] = await db
		.select({
			id: task.id,
			projectId: task.projectId,
			projectKey: project.key,
			createdBy: task.createdBy,
			recurrenceId: task.recurrenceId
		})
		.from(task)
		.innerJoin(project, eq(project.id, task.projectId))
		.where(and(eq(task.id, taskId), isNull(task.deletedAt)))
		.limit(1);
	return row ?? null;
}

/** Read access for the inspector: the task must be readable. */
export async function getTaskRecurrence(
	locals: App.Locals,
	taskId: string
): Promise<RecurrenceSeriesDTO | null> {
	const t = await loadTarget(taskId);
	if (!t || !(await can(locals, 'project.tasks.read', { projectId: t.projectId }))) {
		error(404, 'Task not found.');
	}
	if (!t.recurrenceId) return null;
	const [r] = await db.select().from(taskRecurrence).where(eq(taskRecurrence.id, t.recurrenceId));
	return r ? toDTO(r) : null;
}

/**
 * Managing a series needs the same rights as editing the task (edit.any, or
 * edit.own as its creator) plus task creation in the project, since the
 * series creates tasks in the owner's name.
 */
async function assertCanManage(locals: App.Locals, t: TaskTarget) {
	const me = locals.user;
	if (!me) error(401, 'Not authenticated.');
	const canEdit =
		(await can(locals, 'project.tasks.edit.any', { projectId: t.projectId })) ||
		(t.createdBy === me.id &&
			(await can(locals, 'project.tasks.edit.own', { projectId: t.projectId })));
	if (!canEdit || !(await can(locals, 'project.tasks.create', { projectId: t.projectId }))) {
		error(403, 'You do not have permission to perform this action.');
	}
	return me;
}

/** Snapshot of a task's fields as the series template. */
async function templateFrom(taskId: string) {
	const [row] = await db
		.select({
			title: task.title,
			description: task.description,
			priority: task.priority,
			type: task.type,
			estimateMinutes: task.estimateMinutes,
			tags: task.tags,
			checklist: task.checklist
		})
		.from(task)
		.where(eq(task.id, taskId));
	const assignees = await db
		.select({ userId: taskAssignee.userId })
		.from(taskAssignee)
		.where(eq(taskAssignee.taskId, taskId));
	return {
		...row,
		// Every occurrence starts with an unticked checklist.
		checklist: (row.checklist ?? []).map((c) => ({ ...c, done: false })),
		assigneeIds: assignees.map((a) => a.userId)
	};
}

/**
 * The instant after which the next occurrence is computed when a series is
 * set up or rescheduled: the task it is attached to stands in for "today", so
 * the first new task is never on the same local day as the last one (or as
 * the setup day).
 */
function firstAfter(schedule: RecurrenceSchedule, lastDay: Date): Date {
	const nextDay = new Date(zonedDate(lastDay, schedule.timezone).getTime() + 86_400_000);
	const endOfDay = new Date(zonedInstant(nextDay, '00:00', schedule.timezone).getTime() - 1);
	return new Date(Math.max(Date.now(), endOfDay.getTime()));
}

export type SetRecurrenceInput = {
	schedule: RecurrenceSchedule;
	dueOffsetDays: number | null;
	/** Re-snapshot the template from this task (always true on setup). */
	refreshTemplate?: boolean;
};

/**
 * Make `taskId` recurring, or edit the series it already belongs to. The task
 * becomes (or stays) part of the series; on setup its fields become the
 * template.
 */
export async function setTaskRecurrence(
	locals: App.Locals,
	taskId: string,
	input: SetRecurrenceInput,
	origin: string
): Promise<RecurrenceSeriesDTO> {
	const t = await loadTarget(taskId);
	if (!t) error(404, 'Task not found.');
	const me = await assertCanManage(locals, t);

	const existing = t.recurrenceId
		? (await db.select().from(taskRecurrence).where(eq(taskRecurrence.id, t.recurrenceId)))[0]
		: undefined;
	const lastDay = existing?.lastRunAt ?? new Date();
	const next = nextOccurrence(input.schedule, firstAfter(input.schedule, lastDay));
	const scheduleCols = {
		rule: input.schedule.rule,
		time: input.schedule.time,
		timezone: input.schedule.timezone,
		startsOn: input.schedule.startsOn,
		endsOn: input.schedule.endsOn,
		dueOffsetDays: input.dueOffsetDays,
		nextRunAt: next?.at ?? null
	};

	let row: SeriesRow;
	if (existing) {
		const template = input.refreshTemplate ? await templateFrom(taskId) : {};
		[row] = await db
			.update(taskRecurrence)
			.set({ ...scheduleCols, ...template, origin })
			.where(eq(taskRecurrence.id, existing.id))
			.returning();
	} else {
		const id = crypto.randomUUID();
		row = await db.transaction(async (tx) => {
			const [created] = await tx
				.insert(taskRecurrence)
				.values({
					id,
					projectId: t.projectId,
					createdBy: me.id,
					origin,
					...(await templateFrom(taskId)),
					...scheduleCols
				})
				.returning();
			await tx.update(task).set({ recurrenceId: id }).where(eq(task.id, taskId));
			return created;
		});
	}

	void recordAudit({
		type: 'task.recurrence',
		actorId: me.id,
		targetType: 'task',
		targetId: taskId,
		targetLabel: row.title,
		meta: {
			action: existing ? 'update' : 'create',
			seriesId: row.id,
			projectId: t.projectId,
			rule: row.rule
		}
	});
	return toDTO(row);
}

/** Pause or resume the series `taskId` belongs to. */
export async function setTaskRecurrencePaused(
	locals: App.Locals,
	taskId: string,
	paused: boolean
): Promise<RecurrenceSeriesDTO> {
	const t = await loadTarget(taskId);
	if (!t?.recurrenceId) error(404, 'Task is not recurring.');
	const me = await assertCanManage(locals, t);
	const [existing] = await db
		.select()
		.from(taskRecurrence)
		.where(eq(taskRecurrence.id, t.recurrenceId));
	if (!existing) error(404, 'Task is not recurring.');

	// Resuming skips what was missed while paused: the next occurrence is
	// computed from now, never backfilled.
	const patch = paused
		? { pausedAt: new Date(), pausedReason: null }
		: {
				pausedAt: null,
				pausedReason: null,
				// Resuming also takes over ownership, so a series paused because
				// its owner lost access can be revived by someone who has it.
				createdBy: me.id,
				nextRunAt:
					nextOccurrence(
						scheduleOf(existing),
						firstAfter(scheduleOf(existing), existing.lastRunAt ?? new Date(0))
					)?.at ?? null
			};
	const [row] = await db
		.update(taskRecurrence)
		.set(patch)
		.where(eq(taskRecurrence.id, existing.id))
		.returning();
	void recordAudit({
		type: 'task.recurrence',
		actorId: me.id,
		targetType: 'task',
		targetId: taskId,
		targetLabel: row.title,
		meta: { action: paused ? 'pause' : 'resume', seriesId: row.id, projectId: t.projectId }
	});
	return toDTO(row);
}

/**
 * Stop repeating: delete the series. Tasks it created stay as plain tasks
 * (task.recurrence_id is `on delete set null`).
 */
export async function stopTaskRecurrence(locals: App.Locals, taskId: string): Promise<void> {
	const t = await loadTarget(taskId);
	if (!t?.recurrenceId) return;
	const me = await assertCanManage(locals, t);
	const [gone] = await db
		.delete(taskRecurrence)
		.where(eq(taskRecurrence.id, t.recurrenceId))
		.returning({ id: taskRecurrence.id, title: taskRecurrence.title });
	if (!gone) return;
	void recordAudit({
		type: 'task.recurrence',
		actorId: me.id,
		targetType: 'task',
		targetId: taskId,
		targetLabel: gone.title,
		meta: { action: 'stop', seriesId: gone.id, projectId: t.projectId }
	});
}

// ── Runner ───────────────────────────────────────────────────────────────────

type Created = {
	series: SeriesRow;
	task: { id: string; displayId: string; assignedIds: string[] };
	dueDate: Date | null;
	owner: { id: string; name: string };
	orgId: string | null;
};

/**
 * Create the next task of one series and advance it, atomically.
 *
 * - Scheduled (`completedTaskId` unset): only when the series is due. If the
 *   worker was down across several occurrences, only the most recent one is
 *   created.
 * - Pulled forward (`completedTaskId` set): the series' latest task was just
 *   marked done, so its next occurrence is created now (dated for its own
 *   day) and the schedule moves past it, so the scheduled run won't repeat it.
 *
 * Returns null when there's nothing to do, a concurrent run holds the row, or
 * the series was paused because it can't run.
 */
async function runOne(
	seriesId: string,
	now: Date,
	opts: { completedTaskId?: string } = {}
): Promise<Created | null> {
	return db.transaction(async (tx) => {
		const [s] = await tx
			.select()
			.from(taskRecurrence)
			.where(
				and(
					eq(taskRecurrence.id, seriesId),
					isNull(taskRecurrence.pausedAt),
					isNotNull(taskRecurrence.nextRunAt),
					opts.completedTaskId
						? // Only the newest task pulls the next one forward, so ticking off
							// an older copy (or re-ticking this one) never creates extras.
							or(
								eq(taskRecurrence.lastTaskId, opts.completedTaskId),
								isNull(taskRecurrence.lastTaskId)
							)
						: lte(taskRecurrence.nextRunAt, now)
				)
			)
			.for('update', { skipLocked: true });
		if (!s || !s.nextRunAt) return null;

		const pause = async (reason: string) => {
			await tx
				.update(taskRecurrence)
				.set({ pausedAt: now, pausedReason: reason })
				.where(eq(taskRecurrence.id, s.id));
			return null;
		};

		const [proj] = await tx
			.select({ id: project.id, key: project.key, orgId: project.orgId, status: project.status })
			.from(project)
			.where(eq(project.id, s.projectId));
		if (!proj || proj.status === 'archived') return pause('project_archived');

		const [owner] = s.createdBy
			? await tx
					.select({ id: user.id, name: user.name, banned: user.banned })
					.from(user)
					.where(eq(user.id, s.createdBy))
			: [];
		if (!owner || owner.banned) return pause('owner_missing');
		const memberships = await loadMemberships(owner.id);
		const locals = { user: owner, memberships, isAdmin: await deriveIsAdmin(memberships) };
		if (!(await can(locals, 'project.tasks.create', { projectId: proj.id }))) {
			return pause('no_permission');
		}

		// Catch-up: if the worker was down across several occurrences, create
		// only the most recent one (dated correctly), not a burst of stale tasks.
		const schedule = scheduleOf(s);
		let occurrence = {
			date: formatDate(zonedDate(s.nextRunAt, s.timezone)),
			at: s.nextRunAt
		};
		for (let n = nextOccurrence(schedule, occurrence.at); n && n.at <= now; ) {
			occurrence = n;
			n = nextOccurrence(schedule, n.at);
		}
		const dueDate = s.dueOffsetDays === null ? null : addDays(occurrence.date, s.dueOffsetDays);
		const futureCopy = occurrence.at > now;

		const created = await createTask(
			{
				projectId: proj.id,
				projectKey: proj.key,
				title: s.title,
				description: s.description,
				status: 'todo',
				priority: s.priority,
				type: s.type,
				dueDate,
				estimateMinutes: s.estimateMinutes,
				tags: s.tags,
				checklist: s.checklist.map((c) => ({ ...c, id: crypto.randomUUID(), done: false })),
				assigneeIds: s.assigneeIds,
				createdBy: owner.id,
				channel: 'recurring',
				recurrenceId: s.id
			},
			tx
		);

		// Put the copy into its assignees' week on its own day.
		if (created.assignedIds.length) {
			await tx
				.insert(taskPlanning)
				.values(
					created.assignedIds.map((userId) => ({
						taskId: created.id,
						userId,
						plannedFor: occurrence.date
					}))
				)
				.onConflictDoNothing();
		}

		// `last_run_at` is the occurrence the newest task stands for (not when it
		// was created): rescheduling and resuming skip that day, so a copy
		// pulled forward to Thursday is never created a second time.
		const next = nextOccurrence(schedule, futureCopy ? occurrence.at : now);
		await tx
			.update(taskRecurrence)
			.set({ nextRunAt: next?.at ?? null, lastRunAt: occurrence.at, lastTaskId: created.id })
			.where(eq(taskRecurrence.id, s.id));

		return {
			series: s,
			task: created,
			dueDate,
			owner: { id: owner.id, name: owner.name },
			orgId: proj.orgId
		};
	});
}

/**
 * Called when a task moves into a RECURRENCE_ADVANCE_STATUSES status (in
 * review, done, cancelled): if it is the newest task of a running series,
 * create the series' next task right away instead of waiting for its
 * scheduled time. Never throws — the status change must not fail because of
 * this.
 */
export async function createNextForSeries(taskId: string): Promise<void> {
	try {
		const [t] = await db
			.select({ recurrenceId: task.recurrenceId })
			.from(task)
			.where(eq(task.id, taskId));
		if (!t?.recurrenceId) return;
		const created = await runOne(t.recurrenceId, new Date(), { completedTaskId: taskId });
		if (created) emitCreated(created);
	} catch (err) {
		console.error('[recurring] create next failed', { taskId, err });
	}
}

/**
 * "Delete this and all upcoming": the open tasks created after `taskId` in its
 * series (finished ones are kept as history), so the caller can delete them
 * alongside it, and the series itself is removed so no new tasks come. Returns
 * the ids to delete (excluding `taskId`); empty when the task doesn't repeat.
 * Call before soft-deleting `taskId`.
 */
export async function stopSeriesFrom(
	taskId: string,
	actorId: string
): Promise<{ id: string; number: number; title: string; status: string }[]> {
	const [t] = await db
		.select({ recurrenceId: task.recurrenceId, number: task.number, projectId: task.projectId })
		.from(task)
		.where(eq(task.id, taskId));
	if (!t?.recurrenceId) return [];
	const following = await db
		.select({ id: task.id, number: task.number, title: task.title, status: task.status })
		.from(task)
		.where(
			and(
				eq(task.recurrenceId, t.recurrenceId),
				eq(task.projectId, t.projectId),
				gt(task.number, t.number),
				isNull(task.deletedAt),
				notInArray(task.status, ['done', 'cancelled'])
			)
		);
	const [gone] = await db
		.delete(taskRecurrence)
		.where(eq(taskRecurrence.id, t.recurrenceId))
		.returning({ id: taskRecurrence.id, title: taskRecurrence.title });
	if (gone) {
		void recordAudit({
			type: 'task.recurrence',
			actorId,
			targetType: 'task',
			targetId: taskId,
			targetLabel: gone.title,
			meta: {
				action: 'stop',
				via: 'delete',
				seriesId: gone.id,
				projectId: t.projectId,
				deletedFollowing: following.length
			}
		});
	}
	return following;
}

/** Side effects after commit — same contract as the web create action. */
function emitCreated(c: Created) {
	const origin = (c.series.origin ?? env.ORIGIN ?? '').replace(/\/$/, '');
	const ctx = {
		id: c.task.id,
		displayId: c.task.displayId,
		title: c.series.title,
		orgId: c.orgId,
		projectId: c.series.projectId,
		status: 'todo',
		priority: c.series.priority,
		type: c.series.type
	};
	emitWebhookEvent({
		type: 'task.created',
		orgId: c.orgId,
		projectId: c.series.projectId,
		actor: c.owner,
		assigneeIds: c.task.assignedIds,
		origin,
		data: {
			task: taskSnapshot({ ...ctx, assigneeIds: c.task.assignedIds, dueDate: c.dueDate }, origin),
			description: c.series.description,
			attachments: []
		}
	});
	void notifyTaskAssigned({
		task: ctx,
		assigneeIds: c.task.assignedIds,
		actor: c.owner,
		origin
	}).catch((err) => console.error('recurring task notify failed', err));
	void recordAudit({
		type: 'task.create',
		actorId: c.owner.id,
		targetType: 'task',
		targetId: c.task.id,
		targetLabel: `${c.task.displayId} · ${c.series.title}`,
		orgId: c.orgId,
		meta: {
			projectId: c.series.projectId,
			taskRef: c.task.displayId,
			via: 'recurring',
			seriesId: c.series.id
		}
	});
}

const BATCH = 50;
const MAX_PER_RUN = 1000;

/**
 * Create a task for every due series. Safe to call concurrently (rows are
 * claimed with SKIP LOCKED) and idempotent per occurrence (the series is
 * advanced in the same transaction that creates the task).
 */
export async function runDueRecurrences(): Promise<{
	created: number;
	paused: number;
	failed: number;
}> {
	const now = new Date();
	let created = 0;
	let paused = 0;
	let failed = 0;
	const seen = new Set<string>();

	while (seen.size < MAX_PER_RUN) {
		const due = await db
			.select({ id: taskRecurrence.id })
			.from(taskRecurrence)
			.where(
				and(
					isNull(taskRecurrence.pausedAt),
					lte(taskRecurrence.nextRunAt, now),
					seen.size ? notInArray(taskRecurrence.id, [...seen]) : undefined
				)
			)
			.orderBy(asc(taskRecurrence.nextRunAt))
			.limit(BATCH);
		if (due.length === 0) break;

		for (const { id } of due) {
			seen.add(id);
			try {
				const result = await runOne(id, now);
				if (result) {
					created++;
					emitCreated(result);
				} else {
					const [r] = await db
						.select({ pausedAt: taskRecurrence.pausedAt })
						.from(taskRecurrence)
						.where(eq(taskRecurrence.id, id));
					if (r?.pausedAt) paused++;
				}
			} catch (err) {
				failed++;
				console.error('[recurring] series failed', { id, err });
			}
		}
	}
	return { created, paused, failed };
}

// ── Internal auth ────────────────────────────────────────────────────────────

let secretCache: { value: string; at: number } | null = null;

/**
 * Check a Bearer token against the worker secret (generated by a migration
 * into `internal_secret`). Cached for a minute.
 */
export async function isWorkerToken(header: string | null): Promise<boolean> {
	if (!header?.startsWith('Bearer ')) return false;
	if (!secretCache || Date.now() - secretCache.at > 60_000) {
		const [row] = await db
			.select({ value: internalSecret.value })
			.from(internalSecret)
			.where(eq(internalSecret.name, 'worker'));
		if (!row) return false;
		secretCache = { value: row.value, at: Date.now() };
	}
	const a = Buffer.from(header.slice('Bearer '.length).trim());
	const b = Buffer.from(secretCache.value);
	return a.length === b.length && timingSafeEqual(a, b);
}
