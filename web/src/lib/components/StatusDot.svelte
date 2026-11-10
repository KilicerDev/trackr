<script lang="ts">
	import type { StatusId } from '$lib/types';
	import { TRACKR_STATUSES } from '$lib/config/taxonomy';
	import { statusLabel } from '$lib/utils/labels';
	import { CircleX } from '@lucide/svelte';
	interface Props {
		status: StatusId;
		size?: number;
	}
	let { status, size = 15 }: Props = $props();
	let meta = $derived(TRACKR_STATUSES.find((s) => s.id === status)!);
	// circle-x scaled so the ring's outer edge is `size` and its stroke 1.5px.
	let xBox = $derived(1.2 * (size - 1.5));
	let xStroke = $derived(30 / (size - 1.5));
</script>

<span
	class="relative inline-block shrink-0"
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
		<span class="absolute inset-0 rounded-full border-[1.5px]" style:border-color={meta.dot}></span>
	{:else if status === 'in_progress'}
		<span class="absolute inset-0 rounded-full border-[1.5px]" style:border-color={meta.dot}></span>
		<span
			class="absolute inset-[2px] rounded-full"
			style:background="conic-gradient({meta.dot} 60%, transparent 0)"
		></span>
	{:else if status === 'paused'}
		<span class="absolute inset-0 rounded-full border-[1.5px]" style:border-color={meta.dot}></span>
		<span
			class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-sm"
			style:width="{size * 0.45}px"
			style:height="{size * 0.18}px"
			style:background={meta.dot}
		></span>
	{:else if status === 'in_review'}
		<span class="absolute inset-0 rounded-full border-[1.5px]" style:border-color={meta.dot}></span>
		<span
			class="absolute inset-[2px] rounded-full"
			style:background="conic-gradient({meta.dot} 75%, transparent 0)"
		></span>
	{:else if status === 'done'}
		<span class="absolute inset-0 rounded-full" style:background={meta.dot}></span>
	{:else if status === 'cancelled'}
		<!-- Lucide's circle-x, sized so its ring matches the other statuses:
		     outer edge = `size`, stroke 1.5px (its circle is r=10 in a 24 box). -->
		<span
			class="absolute grid place-items-center"
			style:color={meta.dot}
			style:left="{(size - xBox) / 2}px"
			style:top="{(size - xBox) / 2}px"
		>
			<CircleX size={xBox} strokeWidth={xStroke} aria-hidden="true" />
		</span>
	{/if}
</span>
