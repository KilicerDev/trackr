/**
 * Recurring tasks — the `tasks.recur` job.
 *
 * Driven by a `schedules` row (every 5m, seeded by migration). The Go handler
 * (services/worker/internal/jobs/recur.go) checks for a due series and, only
 * if there is one, POSTs /api/internal/recurring-tasks/run so the tasks are
 * created by $lib/server/recurring-tasks with the app's own side effects.
 * The payload is empty — all state lives in `task_recurrence`.
 */

import { defineJob } from '../core';

export type TasksRecurPayload = Record<string, never>;

export const tasksRecurJob = defineJob<TasksRecurPayload>('tasks.recur');
