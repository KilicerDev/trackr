// Shared shell UI state (sidebar collapse). The toggle lives in the main Topbar
// while the rail is rendered by AppShell, so the state is shared — but via
// Svelte context (per render tree), NOT a module singleton, so concurrent SSR
// requests can't leak each other's state.
//
// Initial value is seeded from the server (preferences.viewState.shell) so the
// first paint is already correct — no expand→collapse flash on load. localStorage
// is the freshest client mirror and is reconciled on mount.
import { getContext, setContext } from 'svelte';
import { MediaQuery } from 'svelte/reactivity';
import { readView, saveView } from '$lib/stores/view';

const KEY = Symbol('trackr.sidebar');

export class SidebarState {
	collapsed = $state(false);
	// The width transition is gated until after first paint, so a restored
	// collapsed state snaps into place on load — only user toggles animate.
	animate = $state(false);
	// Mobile slide-over drawer. Session-only — never persisted, never SSR'd
	// open (the server can't know the viewport, so closed is the safe render).
	mobileOpen = $state(false);
	// PortalShell's rail has no collapse mode; only the mobile drawer applies.
	readonly collapsible: boolean;
	// Fallback `true` = desktop during SSR; only toggle() branches on it, and
	// that can't run before hydration.
	#desktop = new MediaQuery('(min-width: 768px)', true);

	constructor(initialCollapsed: boolean, collapsible = true) {
		this.collapsed = initialCollapsed;
		this.collapsible = collapsible;
	}

	get isDesktop() {
		return this.#desktop.current;
	}

	/** Client-only: adopt the freshest local value, then enable animation. */
	hydrate() {
		const local = readView<{ collapsed?: boolean }>('shell').collapsed;
		if (typeof local === 'boolean') this.collapsed = local;
		requestAnimationFrame(() => (this.animate = true));
	}

	toggle() {
		if (!this.#desktop.current) {
			this.mobileOpen = !this.mobileOpen;
			return;
		}
		if (!this.collapsible) return;
		this.collapsed = !this.collapsed;
		saveView('shell', { collapsed: this.collapsed });
	}

	openMobile() {
		this.mobileOpen = true;
	}

	closeMobile() {
		this.mobileOpen = false;
	}
}

export function setSidebar(initialCollapsed: boolean, collapsible = true): SidebarState {
	const state = new SidebarState(initialCollapsed, collapsible);
	setContext(KEY, state);
	return state;
}

export function getSidebar(): SidebarState | undefined {
	return getContext<SidebarState | undefined>(KEY);
}
