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
			<div class="text-[11px] uppercase tracking-[0.08em] text-text-4 mb-1 px-2">Recent</div>
			<div>
				{#each data.recent as p (p.id)}
					<a
						href="/wiki/{p.id}"
						class="group flex items-center gap-3 py-2.5 border-b border-border hover:bg-surface transition-colors -mx-2 px-2 rounded-md"
					>
						<span class="text-text-3 group-hover:text-text">
							<Icon name={p.icon} size={15} />
						</span>
						<span class="text-[14px] text-text-2 group-hover:text-text shrink-0 truncate max-w-[55%]">
							{p.title}
						</span>
						{#if p.parentId}
							<span class="text-[12px] text-accent/70 truncate min-w-0">
								{folderPath(p.parentId)}
							</span>
						{/if}
						<span class="ml-auto text-text-4 opacity-0 group-hover:opacity-100 transition-opacity">
							<Icon name="chevron" size={13} />
						</span>
					</a>
				{/each}
			</div>
		{:else}
			<EmptyState
				icon="book"
				title="No pages yet"
				hint="Create your first wiki page from the sidebar to get started."
			/>
		{/if}
	</div>
</div>
