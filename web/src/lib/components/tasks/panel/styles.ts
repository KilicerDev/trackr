// One class string per control role in the task side panel, so every "add"
// button, chip and list row looks the same. Radii follow the app: rounded-lg
// for controls and rows, rounded-xl for cards.

/** Every "+ …" action in a section header (link, tag, file, note, item, log time). */
export const SECTION_ACTION =
	'inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text-2 transition-colors hover:bg-surface-2 hover:text-text disabled:cursor-not-allowed disabled:opacity-60';

/** Neutral chip in the chip row (priority, type, tags, add tag). */
export const CHIP =
	'inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text-2 transition-colors';

/** Chips that open a picker get this on top of CHIP / the status chip. */
export const CHIP_INTERACTIVE =
	'hover:border-border-strong hover:text-text disabled:cursor-default disabled:hover:border-border';

/** A row in a section list (meetings, linked items). */
export const ROW_CARD =
	'flex min-w-0 items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2 transition-colors hover:border-border-strong';

/** The open-popover ring, shared by chips and property values. */
export const OPEN_RING = 'ring-2 ring-accent/40';
