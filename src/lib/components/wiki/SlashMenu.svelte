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

	let { state }: { state: State } = $props();

	const styleStr = $derived.by(() => {
		const left = state.rect.left;
		const top = state.rect.bottom + 6;
		return `position: fixed; left: ${left}px; top: ${top}px;`;
	});
</script>

<div
	class="z-[60] w-[260px] bg-bg-elev border border-border rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.25)] p-1"
	style={styleStr}
	role="listbox"
>
	{#if state.items.length === 0}
		<div class="px-3 py-2 text-[12px] text-text-4">No matches</div>
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
				class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left text-[13px] leading-none transition-colors {active
					? 'bg-surface-2 text-text'
					: 'text-text-2 hover:text-text'}"
			>
				<span
					class="grid place-items-center w-7 h-7 rounded-md bg-surface border border-border text-[11.5px] font-medium text-text-2 shrink-0"
				>
					{item.icon}
				</span>
				<div class="flex-1 min-w-0">
					<div class="text-text">{item.label}</div>
					<div class="text-[11px] text-text-4 mt-0.5">{item.hint}</div>
				</div>
			</button>
		{/each}
	{/if}
</div>
