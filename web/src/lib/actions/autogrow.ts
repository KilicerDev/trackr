// Auto-grow a textarea with its content: starts at the height given by the
// `rows` attribute, grows as the user types, and switches to scrolling once
// `maxRows` lines are reached. Pass the bound value as `value` so programmatic
// resets (e.g. a modal clearing its fields) resize too, not just user input.

type Params = { value?: string; maxRows?: number };

export function autogrow(el: HTMLTextAreaElement, params: Params = {}) {
	let maxRows = params.maxRows ?? 7;

	const resize = () => {
		const cs = getComputedStyle(el);
		// `line-height: normal` computes to "normal", not px — approximate it.
		const line = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
		const chrome =
			parseFloat(cs.paddingTop) +
			parseFloat(cs.paddingBottom) +
			parseFloat(cs.borderTopWidth) +
			parseFloat(cs.borderBottomWidth);
		const max = Math.ceil(line * maxRows + chrome);
		// Collapse to auto so scrollHeight reflects the content (floored by the
		// `rows` attribute), then clamp.
		el.style.height = 'auto';
		el.style.height = Math.min(el.scrollHeight, max) + 'px';
		el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
	};

	resize();
	el.addEventListener('input', resize);
	return {
		update(p: Params = {}) {
			maxRows = p.maxRows ?? 7;
			resize();
		},
		destroy() {
			el.removeEventListener('input', resize);
		}
	};
}
