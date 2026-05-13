<script lang="ts">
	import type { User } from '$lib/types';
	import Avatar from './Avatar.svelte';
	interface Props {
		users: (User | undefined)[];
		max?: number;
		size?: number;
		overlap?: number;
	}
	let { users, max = 4, size = 22, overlap = 6 }: Props = $props();
	let shown = $derived(users.filter(Boolean).slice(0, max) as User[]);
	let extra = $derived(Math.max(0, users.filter(Boolean).length - max));
</script>

<div class="flex items-center">
	{#each shown as u, i (u.id)}
		<div style:margin-left={i === 0 ? '0' : `-${overlap}px`}>
			<Avatar user={u} {size} ring />
		</div>
	{/each}
	{#if extra > 0}
		<span
			class="inline-grid place-items-center rounded-full bg-surface-2 text-text-3 text-[10px] font-mono font-medium select-none"
			style:width="{size}px"
			style:height="{size}px"
			style:margin-left="-{overlap}px"
			style:box-shadow="0 0 0 2px var(--bg-elev)">+{extra}</span
		>
	{/if}
</div>
