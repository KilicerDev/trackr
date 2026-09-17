// Client side of /api/tasks/[taskId]: the full task for the inspector, by
// display id or uuid. Resolves to null when the task does not exist or the
// viewer may not see it (both are 404 on the server).
import type { Task } from '$lib/types';

export async function fetchTaskDetail(ref: string, signal?: AbortSignal): Promise<Task | null> {
	const res = await fetch(`/api/tasks/${encodeURIComponent(ref)}`, { signal });
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`Task request failed (${res.status})`);
	const body = (await res.json()) as { task?: Task };
	return body.task ?? null;
}
