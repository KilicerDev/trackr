<script lang="ts">
	export type SlashItem = {
		id: string;
		label: string;
		hint: string;
		icon: string;
	};
	type State = {
		items: SlashItem[];
		activeIndex: number;
		rect: { left: number; top: number; bottom: number };
		onSelect: (index: number) => void;
	};

	import { m } from '$lib/paraglide/messages';

	let { state }: { state: State } = $props();

	const styleStr = $derived.by(() => {
		const left = state.rect.left;
		const top = state.rect.bottom + 6;
		return `position: fixed; left: ${left}px; top: ${top}px;`;
	});
</script>

<div
	class="z-[60] w-[260px] rounded-xl border border-border bg-bg-elev p-1 shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
	style={styleStr}
	role="listbox"
>
	{#if state.items.length === 0}
		<div class="px-3 py-2 text-[12px] text-text-4">{m.wiki_slash_no_matches()}</div>
	{:else}
		{#each state.items as item, i (item.id)}
			{@const active = i === state.activeIndex}
			<button
				type="button"
				role="option"
				aria-selected={active}
				onmousedown={(e) => {
					e.preventDefault();
					state.onSelect(i);
				}}
				onmouseenter={() => (state.activeIndex = i)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] leading-none transition-colors {active
					? 'bg-surface-2 text-text'
					: 'text-text-2 hover:text-text'}"
			>
				<span
					class="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border bg-surface text-[11px] font-medium text-text-2"
				>
					{item.icon}
				</span>
				<div class="min-w-0 flex-1">
					<div class="text-text">{item.label}</div>
					<div class="mt-0.5 text-[11px] text-text-4">{item.hint}</div>
				</div>
			</button>
		{/each}
	{/if}
</div>
