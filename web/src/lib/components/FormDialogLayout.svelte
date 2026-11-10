<script lang="ts">
	// The layout every "create" dialog shares (task, ticket, bulk tasks), so
	// they can't drift apart:
	// - no head bar or divider lines — close floats top-right, the dialog keeps
	//   its accessible name (`title`, screen readers only);
	// - writing on the wider left, a softly tinted property column on the
	//   right (below on narrow screens);
	// - a foot with an optional left slot, then Cancel and the primary action
	//   built from the same box, so they're exactly the same height. The right
	//   inset (12px) matches the property column's, so the action lines up.
	// Render it inside the dialog's <form> (no `onsubmit`: the action submits
	// it) or on its own with an `onsubmit` handler.
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		title: string;
		onclose: () => void;
		main: Snippet;
		aside: Snippet;
		footStart?: Snippet;
		submitLabel: string;
		submitDisabled?: boolean;
		onsubmit?: () => void;
		/** Width of the property column, px. */
		asideWidth?: number;
		/** Minimum height of the body on wide screens, px. */
		minBodyHeight?: number;
	}
	let {
		title,
		onclose,
		main,
		aside,
		footStart,
		submitLabel,
		submitDisabled = false,
		onsubmit,
		asideWidth = 320,
		minBodyHeight = 0
	}: Props = $props();

	const FOOT_BUTTON =
		'inline-flex h-9 items-center justify-center rounded-lg border px-4 text-[14px] leading-none font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';
</script>

<h2 class="sr-only">{title}</h2>
<button
	type="button"
	onclick={onclose}
	class="absolute top-3 right-3 z-10 grid h-8 w-8 place-items-center rounded-lg text-text-3 transition-colors hover:bg-surface hover:text-text"
	aria-label={m.common_close()}
>
	<Icon name="x" size={15} />
</button>

<div
	class="grid md:min-h-[var(--fd-min-h)] md:grid-cols-[minmax(0,1fr)_var(--fd-aside)]"
	style:--fd-aside="{asideWidth}px"
	style:--fd-min-h="{minBodyHeight}px"
>
	<div class="min-w-0 px-6 pt-6 pb-4">
		{@render main()}
	</div>
	<div
		class="mx-3 mb-1 flex flex-col gap-px rounded-xl bg-surface/40 px-2 py-3 md:mx-0 md:mt-12 md:mr-3 md:mb-0"
	>
		{@render aside()}
	</div>
</div>

<div class="flex items-center gap-2 rounded-b-2xl pt-3 pr-3 pb-3 pl-6">
	{#if footStart}{@render footStart()}{/if}
	<div class="ml-auto flex items-center gap-2">
		<button
			type="button"
			onclick={onclose}
			class="{FOOT_BUTTON} border-border bg-surface text-text hover:bg-surface-2"
		>
			{m.common_cancel()}
		</button>
		<button
			type={onsubmit ? 'button' : 'submit'}
			onclick={onsubmit}
			disabled={submitDisabled}
			class="{FOOT_BUTTON} border-transparent bg-accent text-white hover:bg-accent-strong"
		>
			{submitLabel}
		</button>
	</div>
</div>
