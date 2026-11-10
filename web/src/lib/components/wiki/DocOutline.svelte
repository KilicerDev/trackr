<script lang="ts">
	// Document outline for the wiki and notes pages (TRACK-137, Notion-style).
	// A sticky module at the top-right of the document: closed it is a column
	// of short bars, one per heading, indented by level, with the section
	// you're reading in accent — a scroll indicator that costs no space.
	// Hovering it (or tabbing into it) opens the full outline over the page;
	// leaving closes it again. Place it inside the document's `relative`
	// container; it renders nothing while the document has no headings.
	//
	// The outline is read from the rendered heading DOM under `root` (the
	// editor's `.ProseMirror`), keyed by each heading's position. Ids are not
	// injected: ProseMirror re-renders heading nodes on every edit and strips
	// attributes it doesn't own. Bump `rev` whenever the document changes.
	import { untrack } from 'svelte';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		root: HTMLElement | undefined;
		rev: number;
		label?: string;
	}
	let { root, rev, label = m.notes_toc_title() }: Props = $props();

	type TocItem = { index: number; level: number; text: string };
	let items = $state<TocItem[]>([]);
	let activeIndex = $state(-1);

	let hover = $state(false);
	let focus = $state(false);
	const open = $derived(hover || focus);
	let timer: ReturnType<typeof setTimeout> | undefined;
	// Open at once (the bars are the affordance, a delay would feel dead) and
	// close with a short grace period so a cursor drifting off the edge of
	// the panel doesn't snap it shut mid-read.
	function setHover(next: boolean) {
		clearTimeout(timer);
		if (next) hover = true;
		else timer = setTimeout(() => (hover = false), 160);
	}
	$effect(() => () => clearTimeout(timer));

	function headingEls(): HTMLElement[] {
		const pm = root?.querySelector('.ProseMirror');
		if (!pm) return [];
		return Array.from(pm.querySelectorAll('h1, h2, h3')) as HTMLElement[];
	}

	function build() {
		const next: TocItem[] = [];
		headingEls().forEach((el, index) => {
			const text = (el.textContent ?? '').trim();
			if (text) next.push({ index, level: Number(el.tagName[1]), text });
		});
		items = next;
		computeActive();
	}

	// Rebuild on every document change; once more after collaborative content
	// has settled (it streams in after mount).
	// build() writes `items` and then reads it (computeActive), so it runs
	// untracked — tracked, the effect would depend on its own output and
	// re-run forever, which takes the whole page down.
	$effect(() => {
		void rev;
		void root;
		untrack(build);
		const t = setTimeout(build, 400);
		return () => clearTimeout(t);
	});

	// The active section is the last heading whose top has scrolled above the
	// sticky header band (57px + a little), so it highlights what you're reading.
	function computeActive() {
		const els = headingEls();
		if (!items.length) {
			activeIndex = -1;
			return;
		}
		// At the very bottom the last heading can't reach the top band, so pin
		// it active — otherwise the final section could never highlight.
		const scroller = els[0] ? scrollParentOf(els[0]) : null;
		if (scroller && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) {
			activeIndex = items[items.length - 1].index;
			return;
		}
		let active = items[0].index;
		for (const item of items) {
			const el = els[item.index];
			if (!el) continue;
			if (el.getBoundingClientRect().top <= 96) active = item.index;
			else break;
		}
		activeIndex = active;
	}

	function scrollParentOf(el: HTMLElement): HTMLElement | null {
		let p = el.parentElement;
		while (p) {
			const oy = getComputedStyle(p).overflowY;
			if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
			p = p.parentElement;
		}
		return null;
	}

	// Animate the scroll ourselves: native scroll-behavior:smooth is unreliable
	// inside the nested scroll container, so drive scrollTop with rAF.
	function smoothScrollTo(scroller: HTMLElement, target: number) {
		const start = scroller.scrollTop;
		const dest = Math.max(0, Math.min(target, scroller.scrollHeight - scroller.clientHeight));
		const dist = dest - start;
		if (Math.abs(dist) < 2) {
			scroller.scrollTop = dest;
			return;
		}
		const duration = 320;
		let startTs: number | null = null;
		const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
		const step = (ts: number) => {
			startTs ??= ts;
			const t = Math.min(1, (ts - startTs) / duration);
			scroller.scrollTop = start + dist * ease(t);
			if (t < 1) requestAnimationFrame(step);
			else computeActive();
		};
		requestAnimationFrame(step);
	}

	function scrollToHeading(index: number) {
		const el = headingEls()[index];
		if (!el) return;
		const scroller = scrollParentOf(el);
		if (!scroller) {
			el.scrollIntoView({ block: 'start' });
			return;
		}
		// Land the heading just below the sticky header band (matches its
		// scroll-margin-top in wiki-editor.css).
		const offset = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
		smoothScrollTo(scroller, scroller.scrollTop + offset - 76);
	}

	// Keep the active-section highlight current as the document scrolls. The
	// observer is a cheap trigger; the actual pick is done by computeActive.
	$effect(() => {
		void items;
		const els = headingEls();
		if (!els.length) return;
		const io = new IntersectionObserver(computeActive, {
			rootMargin: '-96px 0px 0px 0px',
			threshold: [0, 1]
		});
		els.forEach((el) => io.observe(el));
		return () => io.disconnect();
	});
</script>

{#if items.length > 0}
	<!--
		Floats over the top-right of the document and sticks while you scroll.
		Two layers share one anchor: the bar rail (closed) and the outline panel
		(open) cross-fade in place, and the panel overlays the rail's footprint
		so the hover never breaks while it opens.
	-->
	<aside class="pointer-events-none absolute inset-y-0 right-0 z-10 hidden sm:block">
		<div
			role="presentation"
			onmouseenter={() => setHover(true)}
			onmouseleave={() => setHover(false)}
			onfocusin={() => (focus = true)}
			onfocusout={(e) => {
				if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) {
					focus = false;
				}
			}}
			class="pointer-events-auto sticky top-[73px] mr-3 flex justify-end"
		>
			<!-- Closed: the bar rail. Decorative — the panel carries the controls. -->
			<div
				aria-hidden="true"
				class="flex max-h-[calc(100vh-89px)] flex-col items-start gap-[7px] overflow-hidden px-3.5 py-3 transition-opacity duration-150 {open
					? 'opacity-0'
					: 'opacity-100'}"
			>
				{#each items as item (item.index)}
					<span
						class="block h-[3px] rounded-full transition-colors duration-200 {activeIndex ===
						item.index
							? 'bg-accent'
							: 'bg-text-4'}"
						style:width="{22 - (item.level - 1) * 6}px"
						style:margin-left="{(item.level - 1) * 6}px"
					></span>
				{/each}
			</div>

			<!-- Open: the outline panel, anchored to the rail's top-right corner. -->
			<nav
				aria-label={label}
				class="absolute top-0 right-0 flex max-h-[calc(100vh-89px)] w-[240px] flex-col overflow-hidden rounded-xl border border-border bg-bg-elev/95 shadow-[var(--shadow-elev)] backdrop-blur transition-[opacity,transform] duration-150 ease-out {open
					? 'translate-x-0 opacity-100'
					: 'pointer-events-none translate-x-1.5 opacity-0'}"
			>
				<ul class="overflow-y-auto py-2 pr-2 pl-1.5">
					{#each items as item (item.index)}
						{@const active = activeIndex === item.index}
						<li>
							<button
								type="button"
								onclick={() => scrollToHeading(item.index)}
								title={item.text}
								style:padding-left="{(item.level - 1) * 12 + 10}px"
								class="relative line-clamp-2 w-full rounded-md py-1.5 pr-2 text-left text-[13px] leading-snug [overflow-wrap:anywhere] transition-colors {active
									? 'font-medium text-text'
									: 'text-text-3 hover:bg-surface-2/70 hover:text-text'}"
							>
								{#if active}
									<span
										class="absolute top-1/2 left-0 h-3.5 w-[2px] -translate-y-1/2 rounded-full bg-accent"
									></span>
								{/if}
								{item.text}
							</button>
						</li>
					{/each}
				</ul>
			</nav>
		</div>
	</aside>
{/if}
