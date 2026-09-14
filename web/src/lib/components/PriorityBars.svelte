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
	class="inline-flex h-[13px] shrink-0 items-end gap-[2px]"
	aria-label={priorityLabel(priority)}
	title={priorityLabel(priority)}
>
	<span
		class="block h-[5px] w-[4px] rounded-[1px]"
		style:background={color}
		style:opacity={level === 0 ? 0.35 : 1}
	></span>
	<span
		class="block h-[8px] w-[4px] rounded-[1px]"
		style:background={color}
		style:opacity={level >= 2 ? 1 : 0.35}
	></span>
	<span
		class="block h-[11px] w-[4px] rounded-[1px]"
		style:background={color}
		style:opacity={level >= 3 ? 1 : 0.35}
	></span>
</span>
