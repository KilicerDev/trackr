type Tone = 'default' | 'danger' | 'warn';

export interface ConfirmOptions {
	title: string;
	message?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	tone?: Tone;
	icon?: string;
}

export interface AlertOptions {
	title: string;
	message?: string;
	confirmLabel?: string;
	tone?: Tone;
	icon?: string;
}

interface DialogEntry {
	id: number;
	kind: 'confirm' | 'alert';
	title: string;
	message?: string;
	confirmLabel: string;
	cancelLabel?: string;
	tone: Tone;
	icon?: string;
	resolve: (v: boolean) => void;
}

let nextId = 1;
export const dialogs = $state<{ list: DialogEntry[] }>({ list: [] });

function push(entry: Omit<DialogEntry, 'id'>): number {
	const id = nextId++;
	dialogs.list = [...dialogs.list, { ...entry, id }];
	return id;
}

function resolveById(id: number, value: boolean) {
	const found = dialogs.list.find((d) => d.id === id);
	dialogs.list = dialogs.list.filter((d) => d.id !== id);
	if (found) found.resolve(value);
}

export function confirm(opts: ConfirmOptions): Promise<boolean> {
	return new Promise((resolve) => {
		const id = push({
			kind: 'confirm',
			title: opts.title,
			message: opts.message,
			confirmLabel: opts.confirmLabel ?? 'Confirm',
			cancelLabel: opts.cancelLabel ?? 'Cancel',
			tone: opts.tone ?? 'default',
			icon: opts.icon,
			resolve: (v) => resolve(v)
		});
		// Hook id so the host can dismiss programmatically if needed.
		void id;
	});
}

export function alert(opts: AlertOptions): Promise<void> {
	return new Promise((resolve) => {
		push({
			kind: 'alert',
			title: opts.title,
			message: opts.message,
			confirmLabel: opts.confirmLabel ?? 'OK',
			tone: opts.tone ?? 'default',
			icon: opts.icon,
			resolve: () => resolve()
		});
	});
}

export function _dismiss(id: number, value: boolean) {
	resolveById(id, value);
}
