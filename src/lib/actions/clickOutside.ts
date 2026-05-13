export function clickOutside(node: HTMLElement, callback: () => void) {
	function handle(e: MouseEvent) {
		if (!node.contains(e.target as Node)) callback();
	}
	document.addEventListener('mousedown', handle);
	return {
		destroy() {
			document.removeEventListener('mousedown', handle);
		}
	};
}
