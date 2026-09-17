// Client-side ordering for the tasks / tickets / projects overviews.
//
// A sort is a `{ by, dir }` pair. Every key has a natural direction (due
// dates ascend, priorities descend, …) which the panel uses as the default
// when the user switches keys; the direction toggle flips it. Items without a
// value for the key (no due date, no created timestamp) always sort last,
// regardless of direction — an undated task is backlog, not "due first".

import type { TaskSummary } from '$lib/types';
import type { TicketRow } from '$lib/server/tickets';

export type SortDir = 'asc' | 'desc';
export interface SortSpec<K extends string> {
	by: K;
	dir: SortDir;
}

export type TaskSortBy = 'due' | 'priority' | 'updated' | 'created' | 'title';
export type TicketSortBy = 'priority' | 'activity' | 'created' | 'subject';
export type ProjectSortBy = 'created' | 'updated' | 'name';

export type TaskSort = SortSpec<TaskSortBy>;
export type TicketSort = SortSpec<TicketSortBy>;
export type ProjectSort = SortSpec<ProjectSortBy>;

export const TASK_SORT_IDS: TaskSortBy[] = ['due', 'priority', 'updated', 'created', 'title'];
export const TICKET_SORT_IDS: TicketSortBy[] = ['priority', 'activity', 'created', 'subject'];
export const PROJECT_SORT_IDS: ProjectSortBy[] = ['created', 'updated', 'name'];

export const NATURAL_DIR: Record<TaskSortBy | TicketSortBy | ProjectSortBy, SortDir> = {
	due: 'asc',
	priority: 'desc',
	updated: 'desc',
	created: 'desc',
	title: 'asc',
	activity: 'desc',
	subject: 'asc',
	name: 'asc'
};

// Defaults reproduce what each view showed before sorting was configurable:
// lists keep the server's newest-first order, boards rank by priority.
export const DEFAULT_TASK_LIST_SORT: TaskSort = { by: 'created', dir: 'desc' };
export const DEFAULT_TASK_BOARD_SORT: TaskSort = { by: 'priority', dir: 'desc' };
export const DEFAULT_TICKET_LIST_SORT: TicketSort = { by: 'created', dir: 'desc' };
export const DEFAULT_TICKET_BOARD_SORT: TicketSort = { by: 'priority', dir: 'desc' };
export const DEFAULT_PROJECT_SORT: ProjectSort = { by: 'created', dir: 'desc' };

const isDir = (v: unknown): v is SortDir => v === 'asc' || v === 'desc';

// Saved views come from storage — validate every field before trusting it.
function makeGuard<K extends string>(ids: readonly K[]) {
	return (v: unknown): v is SortSpec<K> =>
		!!v &&
		typeof v === 'object' &&
		ids.includes((v as { by?: unknown }).by as K) &&
		isDir((v as { dir?: unknown }).dir);
}
export const isTaskSort = makeGuard(TASK_SORT_IDS);
export const isTicketSort = makeGuard(TICKET_SORT_IDS);
export const isProjectSort = makeGuard(PROJECT_SORT_IDS);

const PRIO_RANK: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1, none: 0 };

type Key = number | string | null;

function time(v: string | Date | null | undefined): number | null {
	if (!v) return null;
	const ms = v instanceof Date ? v.getTime() : new Date(v).getTime();
	return Number.isNaN(ms) ? null : ms;
}

function compareKeys(a: Key, b: Key, dir: SortDir): number {
	if (a === null && b === null) return 0;
	if (a === null) return 1;
	if (b === null) return -1;
	const d =
		typeof a === 'string' && typeof b === 'string'
			? a.localeCompare(b)
			: a < b
				? -1
				: a > b
					? 1
					: 0;
	return dir === 'asc' ? d : -d;
}

// Generic stable sort by a primary key with optional tie-breakers, each with
// its own fixed direction. Never mutates the input.
function orderBy<T>(items: readonly T[], keys: { key: (t: T) => Key; dir: SortDir }[]): T[] {
	return [...items].sort((a, b) => {
		for (const k of keys) {
			const d = compareKeys(k.key(a), k.key(b), k.dir);
			if (d !== 0) return d;
		}
		return 0;
	});
}

const taskKey: Record<TaskSortBy, (t: TaskSummary) => Key> = {
	due: (t) => time(t.due),
	priority: (t) => PRIO_RANK[t.priority] ?? 0,
	updated: (t) => time(t.updated),
	created: (t) => time(t.createdAt),
	title: (t) => t.title.toLowerCase()
};

export function sortTasks(tasks: readonly TaskSummary[], sort: TaskSort): TaskSummary[] {
	const keys = [{ key: taskKey[sort.by], dir: sort.dir }];
	// Ties fall back to priority, then to the server's newest-first order.
	if (sort.by !== 'priority') keys.push({ key: taskKey.priority, dir: 'desc' });
	if (sort.by !== 'created') keys.push({ key: taskKey.created, dir: 'desc' });
	return orderBy(tasks, keys);
}

const ticketKey: Record<TicketSortBy, (t: TicketRow) => Key> = {
	priority: (t) => PRIO_RANK[t.priority] ?? 0,
	activity: (t) => time(t.lastMessageAt ?? t.updatedAt),
	created: (t) => time(t.createdAt),
	subject: (t) => t.subject.toLowerCase()
};

export function sortTickets(tickets: readonly TicketRow[], sort: TicketSort): TicketRow[] {
	const keys = [{ key: ticketKey[sort.by], dir: sort.dir }];
	if (sort.by !== 'priority') keys.push({ key: ticketKey.priority, dir: 'desc' });
	if (sort.by !== 'activity') keys.push({ key: ticketKey.activity, dir: 'desc' });
	return orderBy(tickets, keys);
}

interface ProjectLike {
	name: string;
	updatedAt: Date | string;
	createdAt?: Date | string;
}

export function sortProjects<T extends ProjectLike>(
	projects: readonly T[],
	sort: ProjectSort
): T[] {
	const key: Record<ProjectSortBy, (p: T) => Key> = {
		created: (p) => time(p.createdAt),
		updated: (p) => time(p.updatedAt),
		name: (p) => p.name.toLowerCase()
	};
	const keys = [{ key: key[sort.by], dir: sort.dir }];
	if (sort.by !== 'name') keys.push({ key: key.name, dir: 'asc' });
	return orderBy(projects, keys);
}
