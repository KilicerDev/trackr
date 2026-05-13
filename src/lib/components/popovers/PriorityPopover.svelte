<script lang="ts">
	import { clickOutside } from '$lib/actions/clickOutside';
	import { autoPlace } from '$lib/actions/autoPlace';
	import PriorityBars from '../PriorityBars.svelte';
	import Icon from '../Icon.svelte';
	import { TRACKR_PRIORITIES } from '$lib/data';
	import type { PriorityId } from '$lib/types';

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
	class="absolute top-full mt-1.5 z-50 bg-bg-elev border border-border rounded-[10px] p-1.5 min-w-[170px]"
	style:box-shadow="var(--shadow-lg)"
>
	{#each TRACKR_PRIORITIES as p (p.id)}
		<button
			type="button"
			onclick={() => { onchange(p.id); onclose(); }}
			class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text"
		>
			<PriorityBars priority={p.id} />
			<span class="text-[13px]">{p.label}</span>
			<span class="ml-auto text-accent {value === p.id ? 'opacity-100' : 'opacity-0'}">
				<Icon name="check" size={13} />
			</span>
		</button>
	{/each}
</div>
