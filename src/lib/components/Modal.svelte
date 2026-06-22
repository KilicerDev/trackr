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
	<div class="fixed inset-0 z-50 grid place-items-center p-4 pointer-events-none">
		<div
			role="dialog"
			aria-modal="true"
			transition:fly={{ y: 12, duration: 220, easing: cubicOut }}
			class="bg-bg-elev border border-border rounded-2xl pointer-events-auto w-full"
			style:max-width="{maxWidth}px"
			style:box-shadow="var(--shadow-lg)"
		>
			{@render children()}
		</div>
	</div>
{/if}
