import type { TaskSummary } from '$lib/types';

// Statuses that end a task: nothing left to do, never overdue, never blocking
// a dependent. Cancelled counts as closed everywhere done does.
export const CLOSED_TASK_STATUSES = ['done', 'cancelled'] as const;

export function isClosedStatus(status: string | null | undefined): boolean {
	return status === 'done' || status === 'cancelled';
}

// Total time actually logged against a task, in minutes. List rows carry the
// server-side sum; a full detail also carries the entries, which are summed
// when the aggregate is missing (older callers, fixtures).
export function loggedMinutes(
	task: Pick<TaskSummary, 'loggedMinutes'> & { timeLogs?: { minutes: number }[] }
): number {
	if (typeof task.loggedMinutes === 'number') return task.loggedMinutes;
	return (task.timeLogs ?? []).reduce((s, l) => s + l.minutes, 0);
}

// The minutes a task should count for in planning views: prefer real logged
// time when any exists, otherwise fall back to the estimate.
export function taskTimeMinutes(
	task: Pick<TaskSummary, 'loggedMinutes' | 'estimate'> & { timeLogs?: { minutes: number }[] }
): number | undefined {
	const logged = loggedMinutes(task);
	return logged > 0 ? logged : task.estimate;
}
