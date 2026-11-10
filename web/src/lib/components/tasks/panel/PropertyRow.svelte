<script lang="ts">
	// Label / value row of the panel's property list. The value is usually a
	// quiet button that opens a picker; the popover anchors to this row.
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		children: Snippet;
	}
	let { label, children }: Props = $props();
</script>

<div class="grid min-h-9 grid-cols-[112px_minmax(0,1fr)] items-center gap-3">
	<span class="text-[13px] text-text-3">{label}</span>
	<div class="relative min-w-0">{@render children()}</div>
</div>
