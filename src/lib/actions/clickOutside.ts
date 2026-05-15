// Fire `callback` when a click lands outside `node`.
//
// Subtle ordering: a trigger's onclick sets `open = true`, Svelte flushes
// effects on a microtask, the action mounts and attaches its listener — all
// before the same click event finishes bubbling to `document`. Without care,
// the listener catches the very click that opened the dropdown and closes it
// instantly. Defer attachment with setTimeout(0) so it lands in the next
// macrotask, after the current event has fully propagated.
//
// Uses `click`, not `mousedown`, so that a click on the trigger reaches the
// trigger's onclick first (which toggles state); the outside-click listener
// then sees the already-closed state and is a no-op, avoiding the
// "close + immediately reopen" race that mousedown caused.
export function clickOutside(node: HTMLElement, callback: () => void) {
	function handle(e: MouseEvent) {
		if (!node.contains(e.target as Node)) callback();
	}
	let attached = false;
	const timer = setTimeout(() => {
		document.addEventListener('click', handle);
		attached = true;
	}, 0);
	return {
		destroy() {
			clearTimeout(timer);
			if (attached) document.removeEventListener('click', handle);
		}
	};
}
