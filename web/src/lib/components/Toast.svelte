<script lang="ts">
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { toast, dismissToast } from '$lib/stores/toast.svelte';

	const colors = {
		ok: {
			bg: 'rgba(127,200,169,0.12)',
			border: 'rgba(127,200,169,0.35)',
			text: '#7fc8a9'
		},
		err: {
			bg: 'rgba(239,79,94,0.12)',
			border: 'rgba(239,79,94,0.35)',
			text: '#ef7a6d'
		}
	} as const;
</script>

{#if toast.items.length > 0}
	<div
		class="pointer-events-none fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2"
	>
		{#each toast.items as t (t.id)}
			{@const c = colors[t.kind]}
			<button
				type="button"
				transition:fly={{ y: 12, duration: 180, easing: cubicOut }}
				onclick={() => dismissToast(t.id)}
				class="pointer-events-auto max-w-[420px] rounded-xl border px-4 py-2.5 text-center text-[13px] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)]"
				style:background={c.bg}
				style:border-color={c.border}
				style:color={c.text}
			>
				{t.msg}
			</button>
		{/each}
	</div>
{/if}
