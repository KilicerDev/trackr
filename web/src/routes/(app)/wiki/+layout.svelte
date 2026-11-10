<script lang="ts">
	import { page } from '$app/state';
	import WikiTree from '$lib/components/wiki/WikiTree.svelte';
	import CreateWikiModal from '$lib/components/wiki/CreateWikiModal.svelte';

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

<!--
	Below md there is no room for both panes: the index route shows only the
	tree, a page only the document (its header crumb leads back to the tree). No
	page header here: the document header carries the path.
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
