<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Button from '$lib/components/Button.svelte';
	import IconButton from '$lib/components/IconButton.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import WikiBlock from '$lib/components/wiki/WikiBlock.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { WIKI_PAGES, userById } from '$lib/data';

	let { data } = $props();
	const page = $derived(data.page);
	const parent = $derived(page.parent ? WIKI_PAGES.find((p) => p.id === page.parent) : null);
	const author = $derived(userById(page.author));

	let outline = $derived(
		page.body.filter((b) => b.kind === 'h1' || b.kind === 'h2') as { kind: 'h1' | 'h2'; text: string }[]
	);
</script>

<svelte:head><title>Trackr · {page.title}</title></svelte:head>

<div class="px-6 py-6">
	<div class="flex items-center gap-2 mb-4 text-[12.5px]">
		<a href="/wiki" class="text-text-3 hover:text-text">Wiki</a>
		{#if parent}
			<span class="text-text-4">/</span>
			<a href="/wiki/{parent.id}" class="text-text-3 hover:text-text">{parent.title}</a>
		{/if}
		<span class="text-text-4">/</span>
		<span class="text-text font-medium">{page.title}</span>
		<div class="ml-auto flex items-center gap-2">
			<IconButton ariaLabel="Share"><Icon name="link" size={14} /></IconButton>
			<IconButton ariaLabel="More"><Icon name="settings" size={14} /></IconButton>
			<Button variant="default" size="sm"><Icon name="plus" size={12} /> Edit</Button>
		</div>
	</div>

	<div class="grid gap-10" style:grid-template-columns="minmax(0, 760px) 220px">
		<article class="min-w-0">
			<div class="flex items-center gap-2 text-[12px] text-text-3 mb-6">
				<Avatar user={author} size={18} />
				<span>Edited by <span class="text-text-2 font-medium">{author?.name}</span></span>
				<span class="text-text-4">·</span>
				<span>Updated {page.updated}</span>
			</div>

			{#if page.body.length === 0}
				<EmptyState icon="book" title="This folder has no content of its own" hint="Pick a page in the sidebar." />
			{:else}
				{#each page.body as block, i (i)}
					<WikiBlock {block} />
				{/each}
			{/if}
		</article>

		<aside class="hidden md:block sticky top-6 self-start">
			<div class="text-[11px] uppercase tracking-[0.08em] text-text-4 mb-3">On this page</div>
			<div class="space-y-1.5">
				{#each outline as h (h.text)}
					<a
						href="#{h.text.replace(/\s+/g, '-').toLowerCase()}"
						class="block text-[12.5px] text-text-3 hover:text-text {h.kind === 'h2' ? 'pl-3' : ''}"
					>
						{h.text}
					</a>
				{/each}
			</div>
		</aside>
	</div>
</div>
