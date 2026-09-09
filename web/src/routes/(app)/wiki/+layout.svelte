<script lang="ts">
	import { brandName } from '$lib/brand';
	import { page } from '$app/state';
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import WikiTree from '$lib/components/wiki/WikiTree.svelte';
	import CreateWikiModal from '$lib/components/wiki/CreateWikiModal.svelte';
	import { m } from '$lib/paraglide/messages';

	let { children } = $props();

	const isIndex = $derived(page.route.id === '/(app)/wiki');

	let createOpen = $state(false);
	let createParentId = $state<string | null>(null);
	let createIsFolder = $state(false);

	function openCreate(parentId: string | null, isFolder: boolean) {
		createParentId = parentId;
		createIsFolder = isFolder;
		createOpen = true;
	}
</script>

<Topbar
	crumbs={[
		{ label: m.shell_workspace_crumb({ brand: brandName() }), href: '/tasks' },
		{ label: m.wiki_breadcrumb_root() }
	]}
/>

<!--
	Below md there is no room for both panes: the index route shows only the
	tree, a page only the document (the crumb leads back to the tree).
-->
<div class="flex min-h-0 flex-1 overflow-hidden">
	<div class="contents {isIndex ? '' : 'max-md:hidden'}">
		<WikiTree oncreate={openCreate} />
	</div>
	<div class="min-w-0 flex-1 overflow-y-auto {isIndex ? 'max-md:hidden' : ''}">
		{@render children()}
	</div>
</div>

<CreateWikiModal
	bind:open={createOpen}
	parentId={createParentId}
	isFolder={createIsFolder}
	onclose={() => (createOpen = false)}
/>
