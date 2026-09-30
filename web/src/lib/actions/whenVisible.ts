import type { Action } from 'svelte/action';

// Calls `onVisible` once the element scrolls into (or near) view, then stops
// observing. Used for render-on-scroll lists: a sentinel at the end of the
// rendered slice asks for the next slice as the user approaches it. Ancestor
// clipping is honoured, so it works inside a scrolling board column as well
// as the page. Without IntersectionObserver (or during SSR) nothing fires;
// the sentinel doubles as a button so the list stays usable.
export const whenVisible: Action<HTMLElement, () => void> = (node, onVisible) => {
	let callback = onVisible;
	if (typeof IntersectionObserver === 'undefined') return;
	const observer = new IntersectionObserver(
		(entries) => {
			if (entries.some((e) => e.isIntersecting)) {
				observer.disconnect();
				callback();
			}
		},
		{ rootMargin: '600px 0px' }
	);
	observer.observe(node);
	return {
		update(next) {
			callback = next;
		},
		destroy() {
			observer.disconnect();
		}
	};
};
