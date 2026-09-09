// Grow a textarea to fit its content (and shrink back) so a one-line field can
// take a long title without clipping. Pass the bound value as the parameter so
// the height is re-measured on every programmatic change, not only on input.
export function autosize(node: HTMLTextAreaElement, value?: unknown) {
	function fit() {
		node.style.height = 'auto';
		node.style.height = `${node.scrollHeight}px`;
	}
	fit();
	node.addEventListener('input', fit);
	return {
		update(next: unknown) {
			value = next;
			fit();
		},
		destroy() {
			node.removeEventListener('input', fit);
		}
	};
}
