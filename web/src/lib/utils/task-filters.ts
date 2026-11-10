// Task list filtering shared by /tasks, the project page and My Week. A
// filter is a map of field → accepted values; a task passes when it matches
// every non-empty field (any value within a field). The toolbar UI is
// components/tasks/TaskFilterSection.svelte.
import type { TaskSummary } from '$lib/types';

export type TaskFilterField = 'status' | 'priority' | 'assignee' | 'project' | 'tags';
export type TaskFilters = Record<string, string[]>;

/** Assignee filter value matching tasks with nobody assigned. */
export const UNASSIGNED = '__unassigned__';

type Filterable = Pick<
	TaskSummary,
	'id' | 'title' | 'status' | 'priority' | 'assignee' | 'assignees' | 'project' | 'labels'
>;

export function matchesTaskFilters(t: Filterable, filters: TaskFilters, search = ''): boolean {
	for (const [field, values] of Object.entries(filters)) {
		if (!values || values.length === 0) continue;
		if (field === 'status' && !values.includes(t.status)) return false;
		if (field === 'priority' && !values.includes(t.priority)) return false;
		if (field === 'assignee') {
			const real = (t.assignees ?? [t.assignee]).filter((a): a is string => !!a);
			const assignees = real.length ? real : [UNASSIGNED];
			if (!assignees.some((a) => values.includes(a))) return false;
		}
		if (field === 'project' && !values.includes(t.project)) return false;
		if (field === 'tags' && !(t.labels ?? []).some((l) => values.includes(l))) return false;
	}
	const q = search.trim().toLowerCase();
	if (q && !t.title.toLowerCase().includes(q) && !t.id.toLowerCase().includes(q)) return false;
	return true;
}

/** Number of selected values across all fields (the filter badge). */
export function activeFilterCount(filters: TaskFilters): number {
	return Object.values(filters).reduce((n, v) => n + (v?.length ?? 0), 0);
}

/** Every tag in use across the given tasks, first-seen order, deduped. */
export function tagsInUse(tasks: { labels?: string[] }[]): string[] {
	const seen = new Set<string>();
	for (const t of tasks) for (const l of t.labels ?? []) seen.add(l);
	return [...seen];
}
