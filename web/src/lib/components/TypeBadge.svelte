<script lang="ts">
	// Task type marker. On its own (pickers, property rows, lists) it is just
	// the type's lucide icon in the type colour — no box. With `idText` (the
	// task panel header) it stays the tinted id badge, matching the ticket
	// panel header.
	import type { TypeId } from '$lib/types';
	import { TRACKR_TYPES } from '$lib/config/taxonomy';
	import { typeLabel } from '$lib/utils/labels';
	import Icon from '$lib/components/Icon.svelte';
	interface Props {
		type: TypeId;
		idText?: string;
		showLabel?: boolean;
	}
	let { type, idText, showLabel = true }: Props = $props();
	let meta = $derived(TRACKR_TYPES.find((t) => t.id === type)!);
</script>

{#if idText}
	<span
		class="inline-flex h-[20px] shrink-0 items-center gap-1.5 rounded-md border px-1.5 font-mono text-[12px] leading-none font-medium whitespace-nowrap"
		style:color={meta.color}
		style:border-color={meta.color + '40'}
		style:background={meta.color + '14'}
	>
		<span class="grid h-[12px] w-[12px] shrink-0 place-items-center">
			<Icon name={meta.icon} size={11} stroke={2.2} />
		</span>
		{#if showLabel}<span class="font-sans">{typeLabel(type)}</span>{/if}
		<span>{idText}</span>
	</span>
{:else}
	<span
		class="inline-flex shrink-0 items-center gap-1.5 leading-none whitespace-nowrap"
		style:color={meta.color}
		title={showLabel ? undefined : typeLabel(type)}
	>
		<Icon name={meta.icon} size={15} stroke={2} />
		{#if showLabel}<span class="text-[13px] font-medium">{typeLabel(type)}</span>{/if}
	</span>
{/if}
