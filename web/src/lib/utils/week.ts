// Pure helpers behind the My Week page (list and board share them).
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
