<script lang="ts">
	import { page } from '$app/state';
	import Icon from '../Icon.svelte';
	import { WIKI_PAGES } from '$lib/data';
	import type { WikiPage } from '$lib/types';

	function children(parent: string | null): WikiPage[] {
		return WIKI_PAGES.filter((p) => p.parent === parent);
	}

	let expanded = $state(new Set<string>(['w-eng', 'w-design', 'w-people']));

	function toggle(id: string) {
		const n = new Set(expanded);
		n.has(id) ? n.delete(id) : n.add(id);
		expanded = n;
	}

	let activeId = $derived(page.url.pathname.split('/').pop());

	let topLevel = $derived(children(null));
</script>

{#snippet row(p: WikiPage, depth: number)}
	{@const hasKids = children(p.id).length > 0}
	{@const isExpanded = expanded.has(p.id)}
	{@const active = activeId === p.id}
	<div>
		<a
			href="/wiki/{p.id}"
			class="flex items-center gap-1.5 py-1 rounded-md hover:bg-[var(--row-hover)] transition-colors text-[13px] {active ? 'bg-[var(--row-active)] text-text' : 'text-text-2'}"
			style:padding-left="{10 + depth * 14}px"
			style:padding-right="8px"
			onclick={hasKids ? (e) => { e.preventDefault(); toggle(p.id); } : undefined}
		>
			{#if hasKids}
				<button
					type="button"
					onclick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(p.id); }}
					class="w-3.5 h-3.5 grid place-items-center text-text-3 hover:text-text transition-transform {isExpanded ? '' : '-rotate-90'}"
				>
					<Icon name="chevron" size={10} />
				</button>
			{:else}
				<span class="w-3.5"></span>
			{/if}
			<span class="text-text-3 {active ? 'text-accent' : ''}">
				<Icon name={p.icon} size={13} />
			</span>
			<span class="truncate">{p.title}</span>
		</a>
		{#if hasKids && isExpanded}
			{#each children(p.id) as kid (kid.id)}
				{@render row(kid, depth + 1)}
			{/each}
		{/if}
	</div>
{/snippet}

<aside class="border-r border-border bg-bg-elev flex flex-col min-h-0" style:width="260px">
	<div class="flex items-center px-4 pt-4 pb-2">
		<span class="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-text-4">Wiki</span>
		<button class="ml-auto w-6 h-6 grid place-items-center rounded-md text-text-3 hover:text-text hover:bg-surface transition-colors" aria-label="New page">
			<Icon name="plus" size={12} />
		</button>
	</div>
	<div class="px-3 pb-3">
		<div class="flex items-center gap-2 bg-surface border border-border rounded-lg px-2.5 py-1.5 text-[12.5px]">
			<span class="text-text-3"><Icon name="search" size={12} /></span>
			<input type="text" placeholder="Search pages…" class="bg-transparent border-0 outline-none flex-1 placeholder:text-text-3" />
		</div>
	</div>
	<div class="flex-1 overflow-y-auto px-1.5 pb-3">
		{#each topLevel as p (p.id)}
			{@render row(p, 0)}
		{/each}
	</div>
</aside>
