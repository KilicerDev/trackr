// Client side of /api/tags: the tag vocabulary for the task and project tag
// pickers, fetched when a picker opens. Results are kept for a short while so
// reopening a picker (or opening a second one) doesn't refetch, and a fetch in
// flight is shared between callers.

export type TagKind = 'task' | 'project';

const TTL_MS = 30_000;
const cache = new Map<TagKind, { at: number; tags: string[] }>();
const inflight = new Map<TagKind, Promise<string[]>>();

export function fetchTagSuggestions(kind: TagKind): Promise<string[]> {
	const hit = cache.get(kind);
	if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.tags);
	const pending = inflight.get(kind);
	if (pending) return pending;

	const p = fetch(`/api/tags?kind=${kind}`)
		.then(async (res) => {
			if (!res.ok) return hit?.tags ?? [];
			const body = (await res.json()) as { tags?: string[] };
			const tags = Array.isArray(body.tags) ? body.tags : [];
			cache.set(kind, { at: Date.now(), tags });
			return tags;
		})
		.catch(() => hit?.tags ?? [])
		.finally(() => inflight.delete(kind));
	inflight.set(kind, p);
	return p;
}
