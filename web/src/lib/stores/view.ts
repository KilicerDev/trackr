// Client helper for persisting per-page view state. Writes are mirrored
// to localStorage immediately (so a page revisit can hydrate before any
// network round-trip) and debounced to the server for cross-device sync.
// Errors are swallowed — view state is best-effort UX, never block on it.

const DEBOUNCE_MS = 400;
const STORAGE_PREFIX = 'trackr:view:';

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

function readLocal(key: string): Record<string, unknown> {
	if (typeof window === 'undefined') return {};
	try {
		const raw = localStorage.getItem(STORAGE_PREFIX + key);
		const parsed = raw ? JSON.parse(raw) : null;
		return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

function writeLocal(key: string, value: Record<string, unknown>) {
	if (typeof window === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
	} catch {
		// quota or private mode — fall back to server-only.
	}
}

// Read locally-cached view state. Used by pages to hydrate instantly on
// revisit, since SvelteKit caches layout data and stale layout-derived
// state would otherwise win until a hard reload.
export function readView<T extends Record<string, unknown>>(key: string): Partial<T> {
	return readLocal(key) as Partial<T>;
}

export function saveView(key: string, patch: Record<string, unknown>) {
	if (typeof window === 'undefined') return;

	// Mirror to localStorage right away so a same-tab revisit reads the
	// freshest state without waiting on the layout cache to refresh.
	writeLocal(key, { ...readLocal(key), ...patch });

	const merged = { ...(pending.get(key) ?? {}), ...patch };
	pending.set(key, merged);
	const existing = timers.get(key);
	if (existing) clearTimeout(existing);
	timers.set(
		key,
		setTimeout(() => void flush(key), DEBOUNCE_MS)
	);
}

// ── Collapsed list/board groups ─────────────────────────────────────────────
// Stored inside a page's view state as `field: { [groupBy]: string[] }` so
// each grouping mode remembers its own set (status ids vs project keys vs
// user ids don't bleed into each other). localStorage wins when present;
// `fallback` carries the server-persisted snapshot so SSR (where there is no
// localStorage) renders the right collapse state and the page doesn't flash
// expanded→collapsed on reload.

function readCollapsedMap(viewKey: string, field: string): Record<string, unknown> {
	const raw = readLocal(viewKey)[field];
	return raw && typeof raw === 'object' && !Array.isArray(raw)
		? (raw as Record<string, unknown>)
		: {};
}

export function readCollapsed(
	viewKey: string,
	field: string,
	group: string,
	fallback?: Record<string, string[]>
): Set<string> {
	const ids = readCollapsedMap(viewKey, field)[group] ?? fallback?.[group];
	return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []);
}

export function saveCollapsed(viewKey: string, field: string, group: string, ids: Set<string>) {
	saveView(viewKey, { [field]: { ...readCollapsedMap(viewKey, field), [group]: [...ids] } });
}

export function flushViewSaves() {
	for (const key of [...timers.keys()]) {
		clearTimeout(timers.get(key)!);
		void flush(key);
	}
}
