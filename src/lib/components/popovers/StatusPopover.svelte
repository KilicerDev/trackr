<script lang="ts">
	import { clickOutside } from '$lib/actions/clickOutside';
	import { autoPlace } from '$lib/actions/autoPlace';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/motion';
	import StatusDot from '../StatusDot.svelte';
	import Icon from '../Icon.svelte';
	import { TRACKR_STATUSES } from '$lib/data';
	import type { StatusId } from '$lib/types';

	interface Props {
		value: StatusId;
		onchange: (s: StatusId) => void;
		onclose: () => void;
	}
	let { value, onchange, onclose }: Props = $props();
</script>

<div
	use:clickOutside={onclose}
	use:autoPlace
	in:fly={POPOVER_IN}
	class="absolute top-full mt-1.5 z-50 bg-bg-elev border border-border rounded-[10px] p-1.5 min-w-[180px]"
	style:box-shadow="var(--shadow-lg)"
>
	{#each TRACKR_STATUSES as s (s.id)}
		<button
			type="button"
			onclick={() => { onchange(s.id); onclose(); }}
			class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text"
		>
			<StatusDot status={s.id} />
			<span class="text-[13px]">{s.label}</span>
			<span class="ml-auto text-accent {value === s.id ? 'opacity-100' : 'opacity-0'}">
				<Icon name="check" size={13} />
			</span>
		</button>
	{/each}
</div>
