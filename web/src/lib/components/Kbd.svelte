<script lang="ts">
	interface Props {
		children: import('svelte').Snippet;
	}
	let { children }: Props = $props();
</script>

<span
	class="inline-flex items-center rounded border border-border bg-surface-2 px-1.5 py-[2px] font-mono text-[10.5px] text-text-3"
>
	{@render children()}
</span>
