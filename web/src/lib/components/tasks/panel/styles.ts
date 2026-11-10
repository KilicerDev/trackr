// Control styles for the task side panel. The panel stays calm by keeping
// borders off almost everything: values and rows are plain text that gets a
// soft background on hover, section actions are small icon buttons, and empty
// sections collapse into one row of quiet "+ …" links. Radii follow the app
// (rounded-md for icon buttons, rounded-lg for rows and values).

/** The "+" in a section header (checklist, files, meetings, linked). */
export const ICON_ACTION =
	'grid h-6 w-6 shrink-0 place-items-center rounded-md text-text-3 transition-colors hover:bg-surface-2 hover:text-text disabled:cursor-not-allowed disabled:opacity-60';

/**
 * "+ Checklist", "+ File", … in the row that stands in for empty sections.
 * leading-none so the label's box is just the text and centres on the icon
 * (with the inherited line-height the words sat off the "+").
 */
export const QUIET_ADD =
	'inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[13px] leading-none text-text-3 transition-colors hover:bg-surface hover:text-text disabled:cursor-not-allowed disabled:opacity-60';

/** A property value: plain until hovered; text lines up with the column. */
export const PROP_VALUE =
	'-mx-2 inline-flex max-w-[calc(100%+1rem)] items-center gap-2 rounded-lg px-2 py-1 text-left text-[14px] text-text transition-colors hover:bg-surface disabled:cursor-default disabled:hover:bg-transparent';

/** A row in a section list (meetings, linked items): no border, hover tint. */
export const ROW =
	'-mx-2 flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface';

/** Small tag pill inside the Tags property. */
export const TAG =
	'inline-flex h-6 items-center gap-1.5 rounded-md bg-surface px-2 text-[12px] text-text-2';

/** The state of a control whose popover is open. */
export const OPEN = 'bg-surface';
