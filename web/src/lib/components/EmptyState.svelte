<script lang="ts">
	import Icon from './Icon.svelte';
	interface Props {
		icon: string;
		title: string;
		hint?: string;
	}
	let { icon, title, hint }: Props = $props();
</script>

<div class="flex flex-col items-center justify-center gap-3 py-16 text-center text-text-3">
	<div class="grid h-12 w-12 place-items-center rounded-2xl border border-border bg-surface">
		<Icon name={icon} size={20} />
	</div>
	<div class="text-[13.5px] text-text-2">{title}</div>
	{#if hint}<div class="max-w-xs text-[12px] text-text-4">{hint}</div>{/if}
</div>
