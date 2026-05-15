import { page } from '$app/state';
import { TRACKR_PROJECTS, userById as mockUserById } from '$lib/data';
import type { ProjectId } from '$lib/types';

type ResolvedUser = {
	id: string;
	name: string;
	initials: string;
	color: string;
};

type ResolvedProject = {
	key: string;
	name: string;
	color: string;
	icon: string;
};

type LayoutData = {
	users?: ResolvedUser[];
	projects?: { key: string; name: string; color: string; icon: string }[];
	archivedProjects?: { key: string; name: string; color: string; icon: string }[];
};

/**
 * Resolve a user id (DB UUID or mock id like "u1") to a display shape.
 * Reads `$page.data.users` first, falls back to the static mock dictionary,
 * and finally returns `undefined` if neither matches.
 */
export function resolveUser(id: string | null | undefined): ResolvedUser | undefined {
	if (!id) return undefined;
	const fromDb = (page.data as LayoutData).users?.find((u) => u.id === id);
	if (fromDb) return fromDb;
	const mock = mockUserById(id);
	if (mock) {
		return { id: mock.id, name: mock.name, initials: mock.initials, color: mock.color };
	}
	return undefined;
}

/**
 * Resolve a project *key* (e.g. "TRACKR") to display data.
 * DB layout data wins; mock dictionary is the fallback.
 */
export function resolveProject(key: string | null | undefined): ResolvedProject | undefined {
	if (!key) return undefined;
	const data = page.data as LayoutData;
	const fromActive = data.projects?.find((p) => p.key === key);
	if (fromActive) return fromActive;
	// Archived projects still resolve so historical task rows render correctly.
	const fromArchived = data.archivedProjects?.find((p) => p.key === key);
	if (fromArchived) return fromArchived;
	const mock = TRACKR_PROJECTS[key as ProjectId];
	if (mock) return { key, name: mock.name, color: mock.color, icon: mock.icon };
	return undefined;
}
