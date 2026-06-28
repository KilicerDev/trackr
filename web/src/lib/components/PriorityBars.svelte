<script lang="ts">
	import type { PriorityId } from '$lib/types';
	import { TRACKR_PRIORITIES } from '$lib/config/taxonomy';
	import { priorityLabel } from '$lib/utils/labels';
	interface Props {
		priority: PriorityId;
	}
	let { priority }: Props = $props();
	let meta = $derived(TRACKR_PRIORITIES.find((p) => p.id === priority)!);
	let level = $derived(meta.bars);
	let color = $derived(meta.color);
</script>

<span
	class="inline-flex shrink-0 items-end gap-[2px] h-[13px]"
	aria-label={priorityLabel(priority)}
	title={priorityLabel(priority)}
>
	<span
		class="block w-[4px] rounded-[1px] h-[5px]"
		style:background={color}
		style:opacity={level === 0 ? 0.35 : 1}
	></span>
	<span
		class="block w-[4px] rounded-[1px] h-[8px]"
		style:background={color}
		style:opacity={level >= 2 ? 1 : 0.35}
	></span>
	<span
		class="block w-[4px] rounded-[1px] h-[11px]"
		style:background={color}
		style:opacity={level >= 3 ? 1 : 0.35}
	></span>
</span>
