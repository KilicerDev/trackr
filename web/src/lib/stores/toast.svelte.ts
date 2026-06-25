// Tiny global toast store. Lives outside any component so any page can
// push notifications without prop-drilling. <Toast /> in the (app) layout
// is the one renderer.

type ToastKind = 'ok' | 'err';
type ToastEntry = { id: number; kind: ToastKind; msg: string };

let nextId = 0;
export const toast = $state<{ items: ToastEntry[] }>({ items: [] });

export function showToast(kind: ToastKind, msg: string, ttlMs = 3500): number {
	const id = ++nextId;
	toast.items = [...toast.items, { id, kind, msg }];
	if (ttlMs > 0) {
		setTimeout(() => dismissToast(id), ttlMs);
	}
	return id;
}

export function dismissToast(id: number) {
	toast.items = toast.items.filter((t) => t.id !== id);
}
