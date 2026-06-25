<script lang="ts">
	import { clickOutside } from '$lib/actions/clickOutside';
	import { autoPlace } from '$lib/actions/autoPlace';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/config/motion';
	import PriorityBars from '../PriorityBars.svelte';
	import Icon from '../Icon.svelte';
	import { TRACKR_PRIORITIES } from '$lib/data';
	import type { PriorityId } from '$lib/types';
	import { priorityLabel } from '$lib/labels';

	interface Props {
		value: PriorityId;
		onchange: (p: PriorityId) => void;
		onclose: () => void;
	}
	let { value, onchange, onclose }: Props = $props();
</script>

<div
	use:clickOutside={onclose}
	use:autoPlace
	in:fly={POPOVER_IN}
	class="absolute top-full z-50 mt-1.5 min-w-[170px] rounded-[10px] border border-border bg-bg-elev p-1.5"
	style:box-shadow="var(--shadow-lg)"
>
	{#each TRACKR_PRIORITIES as p (p.id)}
		<button
			type="button"
			onclick={() => {
				onchange(p.id);
				onclose();
			}}
			class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
		>
			<PriorityBars priority={p.id} />
			<span class="text-[13px]">{priorityLabel(p.id)}</span>
			<span class="ml-auto text-accent {value === p.id ? 'opacity-100' : 'opacity-0'}">
				<Icon name="check" size={13} />
			</span>
		</button>
	{/each}
</div>
