<script lang="ts">
	import Icon from './Icon.svelte';
	interface Props {
		icon: string;
		title: string;
		hint?: string;
	}
	let { icon, title, hint }: Props = $props();
</script>

<div class="flex flex-col items-center justify-center py-16 text-center text-text-3 gap-3">
	<div class="grid place-items-center w-12 h-12 rounded-2xl bg-surface border border-border">
		<Icon name={icon} size={20} />
	</div>
	<div class="text-[13.5px] text-text-2">{title}</div>
	{#if hint}<div class="text-[12px] text-text-4 max-w-xs">{hint}</div>{/if}
</div>
