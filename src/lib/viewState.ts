// Fire-and-forget client helper for persisting per-page view state into
// `user_preferences.view_state[key]`. Coalesces rapid changes so toggling
// filters or switching tabs doesn't spam the API. Errors are swallowed —
// view state is best-effort UX, never block the user on it.

const DEBOUNCE_MS = 400;

const pending = new Map<string, Record<string, unknown>>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

async function flush(key: string) {
	const patch = pending.get(key);
	pending.delete(key);
	timers.delete(key);
	if (!patch) return;
	try {
		await fetch('/api/preferences/view', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ key, patch })
		});
	} catch {
		// best-effort
	}
}

export function saveView(key: string, patch: Record<string, unknown>) {
	if (typeof window === 'undefined') return;
	const merged = { ...(pending.get(key) ?? {}), ...patch };
	pending.set(key, merged);
	const existing = timers.get(key);
	if (existing) clearTimeout(existing);
	timers.set(
		key,
		setTimeout(() => void flush(key), DEBOUNCE_MS)
	);
}

export function flushViewSaves() {
	for (const key of [...timers.keys()]) {
		clearTimeout(timers.get(key)!);
		void flush(key);
	}
}
