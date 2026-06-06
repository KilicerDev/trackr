<script lang="ts">
	import type { PriorityId } from '$lib/types';
	import { TRACKR_PRIORITIES } from '$lib/data';
	import { priorityLabel } from '$lib/labels';
	interface Props {
		priority: PriorityId;
	}
	let { priority }: Props = $props();
	let meta = $derived(TRACKR_PRIORITIES.find((p) => p.id === priority)!);
	let level = $derived(meta.bars);
	let color = $derived(meta.color);
</script>

<span
	class="inline-flex items-end gap-[2px] shrink-0"
	style:height="12px"
	aria-label={priorityLabel(priority)}
	title={priorityLabel(priority)}
>
	<span
		class="block w-[3px] rounded-[1px]"
		style:height="4px"
		style:background={color}
		style:opacity={level === 0 ? 0.35 : 1}
	></span>
	<span
		class="block w-[3px] rounded-[1px]"
		style:height="7px"
		style:background={color}
		style:opacity={level >= 2 ? 1 : 0.35}
	></span>
	<span
		class="block w-[3px] rounded-[1px]"
		style:height="10px"
		style:background={color}
		style:opacity={level >= 3 ? 1 : 0.35}
	></span>
</span>
