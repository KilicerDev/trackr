<script lang="ts">
	import { clickOutside } from '$lib/actions/clickOutside';
	import { autoPlace } from '$lib/actions/autoPlace';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/config/motion';

	interface Props {
		value: number | undefined;
		onchange: (v: number | undefined) => void;
		onclose: () => void;
	}
	let { value, onchange, onclose }: Props = $props();

	const initial = value ?? 0;
	let h = $state(Math.floor(initial / 60));
	let m = $state(initial % 60);

	const PRESETS = [15, 30, 60, 120, 240, 480];
	const labels: Record<number, string> = {
		15: '15m',
		30: '30m',
		60: '1h',
		120: '2h',
		240: '4h',
		480: '8h'
	};

	function commit() {
		const total = h * 60 + m;
		onchange(total > 0 ? total : undefined);
		onclose();
	}

	function preset(min: number) {
		onchange(min);
		onclose();
	}
</script>

<div
	use:clickOutside={commit}
	use:autoPlace
	in:fly={POPOVER_IN}
	class="absolute top-full z-50 mt-1.5 w-[260px] rounded-[10px] border border-border bg-bg-elev p-2.5"
	style:box-shadow="var(--shadow-lg)"
>
	<div class="mb-2 grid grid-cols-2 gap-2">
		<div class="relative">
			<input
				type="number"
				min="0"
				bind:value={h}
				class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-center font-mono text-[14px] outline-none focus:border-border-strong"
			/>
			<span
				class="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-[11.5px] text-text-3"
				>h</span
			>
		</div>
		<div class="relative">
			<input
				type="number"
				min="0"
				max="59"
				bind:value={m}
				class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-center font-mono text-[14px] outline-none focus:border-border-strong"
			/>
			<span
				class="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-[11.5px] text-text-3"
				>m</span
			>
		</div>
	</div>
	<div class="grid grid-cols-3 gap-1.5">
		{#each PRESETS as p (p)}
			<button
				type="button"
				onclick={() => preset(p)}
				class="rounded-md border border-border bg-surface py-1.5 text-[12.5px] font-medium text-text transition-colors hover:bg-surface-2"
			>
				{labels[p]}
			</button>
		{/each}
	</div>
</div>
