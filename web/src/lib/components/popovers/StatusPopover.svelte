<script lang="ts">
	import { clickOutside } from '$lib/actions/clickOutside';
	import { autoPlace } from '$lib/actions/autoPlace';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/config/motion';
	import StatusDot from '../StatusDot.svelte';
	import Icon from '../Icon.svelte';
	import { TRACKR_STATUSES } from '$lib/config/taxonomy';
	import type { StatusId } from '$lib/types';
	import { statusLabel } from '$lib/utils/labels';

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
	class="absolute top-full z-50 mt-1.5 min-w-[198px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
>
	{#each TRACKR_STATUSES as s (s.id)}
		<button
			type="button"
			onclick={() => {
				onchange(s.id);
				onclose();
			}}
			class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
		>
			<StatusDot status={s.id} />
			<span class="text-[14px]">{statusLabel(s.id)}</span>
			<span class="ml-auto text-accent {value === s.id ? 'opacity-100' : 'opacity-0'}">
				<Icon name="check" size={14} />
			</span>
		</button>
	{/each}
</div>
