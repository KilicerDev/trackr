// Flip a popover horizontally if its initial left-anchored position would
// overflow the viewport. Re-evaluated on mount and on resize.
export function autoPlace(node: HTMLElement) {
	function place() {
		// Reset to default (left-anchored).
		node.style.left = '0';
		node.style.right = 'auto';
		const rect = node.getBoundingClientRect();
		const overflowRight = rect.right - (window.innerWidth - 8);
		if (overflowRight > 0) {
			node.style.left = 'auto';
			node.style.right = '0';
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
