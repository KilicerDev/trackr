// Flip a popover so it stays inside the viewport: horizontally if its
// left-anchored position would overflow the right edge, and vertically if its
// default below-the-trigger position (`top-full`) would overflow the bottom —
// in which case it anchors above the trigger instead. Re-evaluated on mount
// and on resize.
export function autoPlace(node: HTMLElement) {
	function place() {
		// Reset to defaults so we always measure from the unflipped position.
		// Clearing top/bottom/margins falls back to the element's own classes
		// (e.g. `top-full mt-1.5`).
		node.style.left = '0';
		node.style.right = 'auto';
		node.style.top = '';
		node.style.bottom = '';
		node.style.marginTop = '';
		node.style.marginBottom = '';

		const rect = node.getBoundingClientRect();

		if (rect.right > window.innerWidth - 8) {
			node.style.left = 'auto';
			node.style.right = '0';
		}
		if (rect.bottom > window.innerHeight - 8) {
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
