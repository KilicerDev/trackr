<script lang="ts">
	import type { StatusId } from '$lib/types';
	import { TRACKR_STATUSES } from '$lib/data';
	import { statusLabel } from '$lib/labels';
	interface Props {
		status: StatusId;
		size?: number;
	}
	let { status, size = 14 }: Props = $props();
	let meta = $derived(TRACKR_STATUSES.find((s) => s.id === status)!);
</script>

<span
	class="inline-block relative shrink-0"
	style:width="{size}px"
	style:height="{size}px"
	aria-label={statusLabel(status)}
	title={statusLabel(status)}
>
	{#if status === 'backlog'}
		<span
			class="absolute inset-0 rounded-full border-[1.5px] border-dashed opacity-70"
			style:border-color={meta.dot}
		></span>
	{:else if status === 'todo'}
		<span
			class="absolute inset-0 rounded-full border-[1.5px]"
			style:border-color={meta.dot}
		></span>
	{:else if status === 'in_progress'}
		<span class="absolute inset-0 rounded-full border-[1.5px]" style:border-color={meta.dot}
		></span>
		<span
			class="absolute inset-[2px] rounded-full"
			style:background="conic-gradient({meta.dot} 60%, transparent 0)"
		></span>
	{:else if status === 'paused'}
		<span class="absolute inset-0 rounded-full border-[1.5px]" style:border-color={meta.dot}
		></span>
		<span
			class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-sm"
			style:width="{size * 0.45}px"
			style:height="{size * 0.18}px"
			style:background={meta.dot}
		></span>
	{:else if status === 'in_review'}
		<span class="absolute inset-0 rounded-full border-[1.5px]" style:border-color={meta.dot}
		></span>
		<span
			class="absolute inset-[2px] rounded-full"
			style:background="conic-gradient({meta.dot} 75%, transparent 0)"
		></span>
	{:else if status === 'done'}
		<span class="absolute inset-0 rounded-full" style:background={meta.dot}></span>
	{/if}
</span>
