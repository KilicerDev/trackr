import type { Task } from '$lib/types';

// Total time actually logged against a task (sum of all time-log entries).
export function loggedMinutes(task: Task): number {
	return (task.timeLogs ?? []).reduce((s, l) => s + l.minutes, 0);
}

// The minutes a task should count for in planning views: prefer real logged
// time when any exists, otherwise fall back to the estimate.
export function taskTimeMinutes(task: Task): number | undefined {
	const logged = loggedMinutes(task);
	return logged > 0 ? logged : task.estimate;
}
