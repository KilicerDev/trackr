// Keep a popover inside its visible bounds: horizontally by shifting it left
// just enough that its left-anchored position (`left: 0` on the trigger) no
// longer overflows the right edge — clamped so the left edge stays visible
// too — and vertically by anchoring above the trigger when its default
// below-the-trigger position (`top-full`) would overflow the bottom.
// Horizontal bounds are the viewport intersected with every overflow-clipping
// ancestor (e.g. the task drawer's `overflow-hidden` panel), so a popover is
// never shifted out past an edge that would clip it. Re-evaluated on mount
// and on resize.
const EDGE = 8;

export function autoPlace(node: HTMLElement) {
	// Horizontal bounds the popover must stay within: the viewport, tightened
	// by every ancestor that clips overflow.
	function horizontalBounds() {
		let left = EDGE;
		let right = window.innerWidth - EDGE;
		for (let el = node.parentElement; el; el = el.parentElement) {
			const s = getComputedStyle(el);
			if (/(auto|scroll|hidden|clip)/.test(s.overflowX + s.overflowY)) {
				const r = el.getBoundingClientRect();
				left = Math.max(left, r.left + EDGE);
				right = Math.min(right, r.right - EDGE);
			}
		}
		return { left, right };
	}

	function place() {
		// Reset to defaults so we always measure from the unshifted position.
		// Clearing top/bottom/margins falls back to the element's own classes
		// (e.g. `top-full mt-1.5`).
		node.style.left = '0';
		node.style.right = 'auto';
		node.style.top = '';
		node.style.bottom = '';
		node.style.marginTop = '';
		node.style.marginBottom = '';

		const rect = node.getBoundingClientRect();
		const bounds = horizontalBounds();

		if (rect.right > bounds.right) {
			// Shift left by the overflow, but never push the left edge out of
			// view — when the popover is wider than the available space, keeping
			// the left edge visible wins.
			const shift = Math.min(rect.right - bounds.right, rect.left - bounds.left);
			if (shift > 0) node.style.left = `${-shift}px`;
		}
		if (rect.bottom > window.innerHeight - EDGE) {
			// Not enough room below — anchor above the trigger.
			node.style.top = 'auto';
			node.style.bottom = '100%';
			node.style.marginTop = '0';
			node.style.marginBottom = '6px';
		}
	}
	place();
	const ro = new ResizeObserver(place);
	ro.observe(node);
	window.addEventListener('resize', place);
	return {
		destroy() {
			ro.disconnect();
			window.removeEventListener('resize', place);
		}
	};
}
