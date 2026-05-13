<script lang="ts">
	import type { TypeId } from '$lib/types';
	import { TRACKR_TYPES } from '$lib/data';
	interface Props {
		type: TypeId;
		idText?: string;
		showLabel?: boolean;
	}
	let { type, idText, showLabel = true }: Props = $props();
	let meta = $derived(TRACKR_TYPES.find((t) => t.id === type)!);
</script>

<span
	class="inline-flex items-center gap-1.5 h-[18px] text-[11px] font-mono font-medium px-1.5 rounded-md border leading-none"
	style:color={meta.color}
	style:border-color={meta.color + '40'}
	style:background={meta.color + '14'}
>
	<span class="grid place-items-center w-[11px] h-[11px] shrink-0">
		<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
			{#if meta.icon === 'square'}<rect x="5" y="5" width="14" height="14" rx="2" />
			{:else if meta.icon === 'bug'}<rect
					x="7"
					y="9"
					width="10"
					height="10"
					rx="3"
				/><path d="M9 6l-2-2M15 6l2-2M5 12H3M21 12h-2M9 19l-2 2M15 19l2 2" />
			{:else if meta.icon === 'triangle'}<path d="M12 4 22 20H2z" />
			{:else if meta.icon === 'sparkle'}<path d="M12 3v6M12 15v6M3 12h6M15 12h6M6 6l3 3M15 15l3 3M6 18l3-3M15 9l3-3" />
			{:else if meta.icon === 'gear'}<circle cx="12" cy="12" r="3" /><path
					d="M12 2v3M12 19v3M22 12h-3M5 12H2M18 6l-2 2M8 16l-2 2M18 18l-2-2M8 8 6 6"
				/>
			{/if}
		</svg>
	</span>
	{#if showLabel}<span class="font-sans">{meta.label}</span>{/if}
	{#if idText}<span>{idText}</span>{/if}
</span>
