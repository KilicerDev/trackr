<script lang="ts">
	import Avatar from './Avatar.svelte';
	type StackUser = { id: string; name: string; initials: string; color: string };
	interface Props {
		users: (StackUser | undefined)[];
		max?: number;
		size?: number;
		overlap?: number;
	}
	let { users, max = 4, size = 24, overlap = 7 }: Props = $props();
	let shown = $derived(users.filter(Boolean).slice(0, max) as StackUser[]);
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
			class="inline-grid place-items-center rounded-full bg-surface-2 font-mono text-[11px] font-medium text-text-3 ring-2 ring-bg-elev select-none"
			style:width="{size}px"
			style:height="{size}px"
			style:margin-left="-{overlap}px">+{extra}</span
		>
	{/if}
</div>
