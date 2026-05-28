<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const firstName = $derived((data.user?.name ?? '').trim().split(/\s+/)[0] || 'there');

	// Folder path of a page, built by walking parentId up the tree the layout
	// already loaded. Empty for root-level pages.
	const byId = $derived(new Map(data.tree.map((n) => [n.id, n])));
	function folderPath(parentId: string | null): string {
		const parts: string[] = [];
		let cur = parentId;
		while (cur) {
			const node = byId.get(cur);
			if (!node) break;
			parts.unshift(node.title);
			cur = node.parentId;
		}
		return parts.join(' / ');
	}
</script>

<div class="h-full flex justify-center px-6">
	<div class="w-full max-w-[640px] pt-[14vh]">
		<h1 class="text-[28px] font-semibold tracking-[-0.02em] text-text mb-6">
			Welcome back, {firstName}
		</h1>

		{#if data.recent.length > 0}
			<div class="mb-3 px-0.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-text-4">
				Recent
			</div>
			<div class="grid gap-2">
				{#each data.recent as p (p.id)}
					{@const path = p.parentId ? folderPath(p.parentId) : ''}
					<a
						href="/wiki/{p.id}"
						class="group flex items-center gap-3 rounded-xl border border-border/70 bg-bg-elev/40 px-3.5 py-3 transition-all hover:border-border-strong hover:bg-surface"
					>
						<span
							class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface text-text-3 transition-colors group-hover:text-accent"
						>
							<Icon name="file" size={15} stroke={1.75} />
						</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-[13.5px] text-text-2 group-hover:text-text">
								{p.title}
							</span>
							{#if path}
								<span class="mt-0.5 block truncate text-[12px] text-text-4">{path}</span>
							{/if}
						</span>
						<span
							class="shrink-0 -translate-x-1 text-text-4 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
						>
							<Icon name="chevron" size={14} />
						</span>
					</a>
				{/each}
			</div>
		{:else}
			<EmptyState
				icon="file"
				title="No pages yet"
				hint="Create your first wiki page from the sidebar to get started."
			/>
		{/if}
	</div>
</div>
