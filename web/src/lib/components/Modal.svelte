<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	interface Props {
		open: boolean;
		onclose: () => void;
		maxWidth?: number;
		children: Snippet;
	}
	let { open, onclose, maxWidth = 560, children }: Props = $props();
</script>

{#if open}
	<button
		type="button"
		aria-label="Close modal"
		onclick={onclose}
		transition:fade={{ duration: 180 }}
		class="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px]"
	></button>
	<div class="pointer-events-none fixed inset-0 z-50 grid place-items-center p-4">
		<div
			role="dialog"
			aria-modal="true"
			transition:fly={{ y: 12, duration: 220, easing: cubicOut }}
			class="pointer-events-auto w-full rounded-2xl border border-border bg-bg-elev shadow-lg"
			style:max-width="{maxWidth}px"
		>
			{@render children()}
		</div>
	</div>
{/if}
