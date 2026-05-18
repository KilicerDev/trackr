<script lang="ts">
	import { clickOutside } from '$lib/actions/clickOutside';
	import { autoPlace } from '$lib/actions/autoPlace';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/motion';
	import Icon from '../Icon.svelte';

	interface Props {
		canDelete: boolean;
		ondelete: () => void;
		onclose: () => void;
	}
	let { canDelete, ondelete, onclose }: Props = $props();
</script>

<div
	use:clickOutside={onclose}
	use:autoPlace
	in:fly={POPOVER_IN}
	class="absolute top-full right-0 mt-1.5 z-50 bg-bg-elev border border-border rounded-[10px] p-1.5 min-w-[180px]"
	style:box-shadow="var(--shadow-lg)"
>
	<button
		type="button"
		onclick={() => {
			ondelete();
			onclose();
		}}
		disabled={!canDelete}
		class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left text-[13px] leading-none hover:bg-[#ef4f5e]/10 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
		style:color="#ef4f5e"
	>
		<span class="grid place-items-center w-4 h-4 shrink-0"><Icon name="trash" size={14} /></span>
		<span>Delete task</span>
	</button>
</div>
