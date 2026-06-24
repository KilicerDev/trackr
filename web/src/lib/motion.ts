import { cubicOut } from 'svelte/easing';

/**
 * Default in-transition for popovers / dropdowns. Subtle 4px slide down
 * with a fade, no out transition (snap close). Used app-wide so tuning
 * here propagates everywhere.
 */
export const POPOVER_IN = { y: -4, duration: 140, easing: cubicOut } as const;
