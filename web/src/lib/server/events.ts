// In-process per-user event bus backing the `/api/v1/events` SSE stream.
//
// Publishers push tiny invalidation hints ("this entity changed", "your inbox
// changed") — never data. Clients react by refetching through the normal API,
// so there is no second representation of any resource to keep consistent.
//
// The bus is process-local by design: trackr deploys as a single node process
// (see src/server.ts). A multi-instance deployment would need to swap this for
// Postgres LISTEN/NOTIFY behind the same publish/subscribe signatures.

export type AppEvent =
	| { type: 'entity'; entityType: string; entityId: string }
	| { type: 'inbox' };

type Subscriber = (event: AppEvent) => void;

// Survive dev-server HMR: module state resets on reload, globalThis doesn't.
// Same pattern as the collab server's __collabAttached guard.
const globalStore = globalThis as typeof globalThis & {
	__trackrEventSubscribers?: Map<string, Set<Subscriber>>;
};
const subscribers = (globalStore.__trackrEventSubscribers ??= new Map());

export function subscribeEvents(userId: string, fn: Subscriber): () => void {
	let set = subscribers.get(userId);
	if (!set) {
		set = new Set();
		subscribers.set(userId, set);
	}
	set.add(fn);
	return () => {
		set.delete(fn);
		if (set.size === 0) subscribers.delete(userId);
	};
}

export function publishEvent(userIds: Iterable<string>, event: AppEvent): void {
	for (const userId of new Set(userIds)) {
		const set = subscribers.get(userId);
		if (!set) continue;
		for (const fn of set) {
			// One dead subscriber must never break fan-out to the rest.
			try {
				fn(event);
			} catch {
				set.delete(fn);
			}
		}
	}
}
