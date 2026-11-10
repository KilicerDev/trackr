// Pure helpers behind the My Week page (list and board share them).
import { isClosedStatus } from './task';

export type ProjectInfo = { name: string; color: string } | undefined;

export type DayGroup<T> = { key: string; name: string; color: string; tasks: T[] };

const FALLBACK_COLOR = '#7c7c84';

/**
 * Per-project sub-sections within a day, alphabetical by project name, so a
 * mixed day reads as "which project gets how much of it" at a glance. Task
 * order inside a group is kept as given.
 */
export function dayProjectGroups<T extends { project: string }>(
	tasks: T[],
	resolve: (key: string) => ProjectInfo
): DayGroup<T>[] {
	const byKey = new Map<string, T[]>();
	for (const t of tasks) {
		const list = byKey.get(t.project);
		if (list) list.push(t);
		else byKey.set(t.project, [t]);
	}
	return [...byKey]
		.map(([key, list]) => {
			const p = resolve(key);
			return { key, name: p?.name ?? key, color: p?.color ?? FALLBACK_COLOR, tasks: list };
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Day placement ───────────────────────────────────────────────────────────
// A task can sit on several days of the week, so long-running work shows
// wherever it actually happens:
//   planned  — the day it's planned for (per user, task_planning)
//   chunk    — any other day this week I logged time on it
//   carried  — still open and planned for a day before today: it rolls onto
//              today on its own (current week only) until it's done or
//              re-planned
// Each entry carries the minutes it counts for on that day.

export type DayEntryKind = 'planned' | 'chunk' | 'carried';

export type DayEntry<T> = {
	task: T;
	/** Copied from the task so entries group like tasks (dayProjectGroups). */
	project: string;
	kind: DayEntryKind;
	/** Minutes this entry counts for on its day. */
	minutes: number;
	/** My time logged on the task that day. */
	loggedThatDay: number;
};

/** My time on one task on one day (task_time_log summed by task and date). */
export type DayLog = { taskUuid: string; date: string; minutes: number };

export type PlaceableTask = {
	uuid: string;
	project: string;
	status: string;
	plannedFor?: string | null;
	estimate?: number;
	loggedMinutes?: number;
};

/**
 * What's left of a task: estimate minus everything logged on it (anyone, any
 * day), never below zero; nothing for closed tasks. Without an estimate a task
 * counts `defaultEstimate` until any time is logged.
 */
export function remainingMinutes(t: PlaceableTask, defaultEstimate: number): number {
	if (isClosedStatus(t.status)) return 0;
	const logged = t.loggedMinutes ?? 0;
	if (t.estimate == null) return logged > 0 ? 0 : defaultEstimate;
	return Math.max(0, t.estimate - logged);
}

/** Still being worked on: not closed and not waiting in review. */
function carriesOver(t: PlaceableTask): boolean {
	return !isClosedStatus(t.status) && t.status !== 'in_review';
}

export function placeWeekTasks<T extends PlaceableTask>(opts: {
	tasks: T[];
	weekDates: string[];
	todayIso: string;
	dayLogs: DayLog[];
	defaultEstimate: number;
}): DayEntry<T>[][] {
	const { tasks, weekDates, todayIso, dayLogs, defaultEstimate } = opts;
	const days: DayEntry<T>[][] = weekDates.map(() => []);
	const todayIdx = weekDates.indexOf(todayIso);

	const logsByTask = new Map<string, Map<string, number>>();
	for (const l of dayLogs) {
		if (l.minutes <= 0) continue;
		const byDate = logsByTask.get(l.taskUuid) ?? new Map<string, number>();
		byDate.set(l.date, (byDate.get(l.date) ?? 0) + l.minutes);
		logsByTask.set(l.taskUuid, byDate);
	}

	for (const t of tasks) {
		const logs = logsByTask.get(t.uuid);
		const loggedOn = (iso: string) => logs?.get(iso) ?? 0;
		const placed = new Set<number>();
		const push = (idx: number, kind: DayEntryKind, minutes: number) => {
			placed.add(idx);
			days[idx].push({
				task: t,
				project: t.project,
				kind,
				minutes,
				loggedThatDay: loggedOn(weekDates[idx])
			});
		};

		const carried = todayIdx >= 0 && !!t.plannedFor && t.plannedFor < todayIso && carriesOver(t);
		const plannedIdx = t.plannedFor ? weekDates.indexOf(t.plannedFor) : -1;

		if (plannedIdx >= 0) {
			const logged = loggedOn(weekDates[plannedIdx]);
			// A planned day that has passed while the task carried over keeps
			// only what was logged there; the rest of the work moved to today.
			push(
				plannedIdx,
				'planned',
				logged > 0 ? logged : carried ? 0 : remainingMinutes(t, defaultEstimate)
			);
		}
		if (carried && !placed.has(todayIdx)) {
			const logged = loggedOn(todayIso);
			push(todayIdx, 'carried', logged > 0 ? logged : remainingMinutes(t, defaultEstimate));
		}
		for (const [date, minutes] of logs ?? []) {
			const idx = weekDates.indexOf(date);
			if (idx >= 0 && !placed.has(idx)) push(idx, 'chunk', minutes);
		}
	}
	return days;
}
