// Shared shell UI state (sidebar collapse). The toggle lives in the main Topbar
// while the rail is rendered by AppShell, so the state is shared — but via
// Svelte context (per render tree), NOT a module singleton, so concurrent SSR
// requests can't leak each other's state.
//
// Initial value is seeded from the server (preferences.viewState.shell) so the
// first paint is already correct — no expand→collapse flash on load. localStorage
// is the freshest client mirror and is reconciled on mount.
import { getContext, setContext } from 'svelte';
import { readView, saveView } from '$lib/stores/view';

const KEY = Symbol('trackr.sidebar');

export class SidebarState {
	collapsed = $state(false);
	// The width transition is gated until after first paint, so a restored
	// collapsed state snaps into place on load — only user toggles animate.
	animate = $state(false);

	constructor(initialCollapsed: boolean) {
		this.collapsed = initialCollapsed;
	}

	/** Client-only: adopt the freshest local value, then enable animation. */
	hydrate() {
		const local = readView<{ collapsed?: boolean }>('shell').collapsed;
		if (typeof local === 'boolean') this.collapsed = local;
		requestAnimationFrame(() => (this.animate = true));
	}

	toggle() {
		this.collapsed = !this.collapsed;
		saveView('shell', { collapsed: this.collapsed });
	}
}

export function setSidebar(initialCollapsed: boolean): SidebarState {
	const state = new SidebarState(initialCollapsed);
	setContext(KEY, state);
	return state;
}

export function getSidebar(): SidebarState | undefined {
	return getContext<SidebarState | undefined>(KEY);
}
