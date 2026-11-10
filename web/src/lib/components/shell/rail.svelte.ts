// Collapse behaviour for a shell rail, shared by the app and portal sidebars
// so both fold identically.
//
// Two states matter. `collapsed` is the *layout* state: the shell's grid
// column is 64px. `rail` is the *visual* state: icons only. They differ only
// while a menu opened from the rail is showing (the workspace menu at the top,
// the account menu at the foot): the rail then widens over the page (the
// column stays 64px, nothing underneath shifts) so the menu has room. It does
// NOT open on hover or keyboard focus — a folded rail stays folded; the
// expand button and the tooltips cover the rest.
//
// Seamless folding: the icon must never move. Its left offset is
// container-padding + row-margin + row-padding, held at a constant 23px in
// both states so an 18px glyph sits at x=32 — dead-centre of the 64px rail,
// on the same axis as the brand mark above it. The container pads 8px, so
// only the row's own margin/padding interpolate (deltas cancel: −4 +4 = 0).
// Folded, each row is a 48×36 tile on the same centre axis as the 40×40
// instance tile, so the rail reads as one stack.
import { getSidebar } from '$lib/stores/sidebar.svelte';

const ROW =
	'group/nav relative my-px flex h-9 items-center gap-2.5 rounded-lg text-[14px] text-text-2 transition-[margin,padding,background-color,color] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-accent/60';

export class Rail {
	menuOpen = $state(false);
	/** The account menu at the rail's foot is open (keeps the rail peeking). */
	accountOpen = $state(false);
	#sidebar = getSidebar();
	readonly expandedWidth: number;

	/** Call during component init (it registers effects and reads context). */
	constructor(expandedWidth: number) {
		this.expandedWidth = expandedWidth;
	}

	get collapsed(): boolean {
		return !!this.#sidebar?.collapsed;
	}
	get peek(): boolean {
		return this.collapsed && (this.menuOpen || this.accountOpen);
	}
	get rail(): boolean {
		return this.collapsed && !this.peek;
	}

	/** Label class: opacity only, never removed from flow, so nothing reflows. */
	get fade(): string {
		return `whitespace-nowrap transition-opacity duration-150 ${
			this.rail ? 'pointer-events-none opacity-0' : 'opacity-100'
		}`;
	}
	/** Nav row without a hover background — for rows that bring their own. */
	get rowBase(): string {
		return `${ROW} ${this.rail ? 'mx-0 px-[15px]' : 'mx-1 px-[11px]'}`;
	}
	get row(): string {
		return `${this.rowBase} hover:bg-[var(--row-hover)] hover:text-text`;
	}
	/** Leading icon box: brighter when folded, since nothing else carries the row. */
	icon(active: boolean): string {
		return `grid h-[18px] w-[18px] shrink-0 place-items-center transition-colors duration-150 ${
			active
				? 'text-accent'
				: this.rail
					? 'text-text-2 group-hover/nav:text-text'
					: 'text-text-3 group-hover/nav:text-text-2'
		}`;
	}
	/**
	 * The aside is a grid child sized to its track; widening it overflows the
	 * track to the right and, positioned with a z-index, paints over <main>
	 * instead of pushing it. Pair with `style:width={rail.width}`.
	 */
	get aside(): string {
		return `relative flex min-h-0 w-full flex-col overflow-hidden border-r border-border bg-bg-elev transition-[width,box-shadow] duration-200 ease-out md:h-full ${
			this.peek ? 'z-30 shadow-[var(--shadow-elev)]' : 'shadow-none'
		}`;
	}
	get width(): string | undefined {
		return this.peek ? `${this.expandedWidth}px` : undefined;
	}
}
