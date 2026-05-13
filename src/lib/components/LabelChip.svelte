<script lang="ts">
	import { TRACKR_LABELS } from '$lib/data';
	interface Props {
		id: string;
	}
	let { id }: Props = $props();
	let meta = $derived(TRACKR_LABELS[id]);
</script>

{#if meta}
	<span
		class="inline-flex items-center gap-1 text-[11px] font-mono font-medium px-[6px] py-[2px] rounded-[5px]"
		style:color={meta.color}
		style:background={meta.color + '24'}
	>
		{meta.label}
	</span>
{/if}
