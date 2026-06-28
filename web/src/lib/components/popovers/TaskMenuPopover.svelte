<script lang="ts">
	import { clickOutside } from '$lib/actions/clickOutside';
	import { autoPlace } from '$lib/actions/autoPlace';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/config/motion';
	import Icon from '../Icon.svelte';
	import { m } from '$lib/paraglide/messages';

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
	class="absolute top-full right-0 z-50 mt-1.5 min-w-[198px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
>
	<button
		type="button"
		onclick={() => {
			ondelete();
			onclose();
		}}
		disabled={!canDelete}
		class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[14px] leading-none hover:bg-[#ef4f5e]/10 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent text-prio-urgent"
	>
		<span class="grid h-4 w-4 shrink-0 place-items-center"><Icon name="trash" size={15} /></span>
		<span>{m.tasks_delete_task()}</span>
	</button>
</div>
