import { page } from '$app/state';

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
 * Resolve a user id (DB UUID) to a display shape from the app-wide
 * `$page.data.users`, or `undefined` if it isn't visible to the current user.
 */
export function resolveUser(id: string | null | undefined): ResolvedUser | undefined {
	if (!id) return undefined;
	return (page.data as LayoutData).users?.find((u) => u.id === id);
}

/**
 * Resolve a project *key* (e.g. "TRACKR") to display data from the app-wide
 * layout data. Archived projects still resolve so historical task rows render
 * correctly; returns `undefined` if the key matches nothing visible.
 */
export function resolveProject(key: string | null | undefined): ResolvedProject | undefined {
	if (!key) return undefined;
	const data = page.data as LayoutData;
	return (
		data.projects?.find((p) => p.key === key) ??
		data.archivedProjects?.find((p) => p.key === key)
	);
}
