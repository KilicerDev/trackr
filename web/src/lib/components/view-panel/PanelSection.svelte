<script lang="ts">
	// One card inside the ViewPanel: a title row (with an optional right-hand
	// action) above its controls.
	import type { Snippet } from 'svelte';
	interface Props {
		title: string;
		action?: Snippet;
		children: Snippet;
	}
	let { title, action, children }: Props = $props();
</script>

<section class="rounded-xl border border-border bg-surface/40 p-3">
	<div class="flex h-6 items-center gap-2">
		<h3 class="text-[13px] font-semibold text-text">{title}</h3>
		{#if action}
			<div class="ml-auto flex items-center">{@render action()}</div>
		{/if}
	</div>
	<div class="mt-2.5 space-y-2.5">
		{@render children()}
	</div>
</section>
