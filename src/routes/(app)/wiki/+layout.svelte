<script lang="ts">
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import WikiTree from '$lib/components/wiki/WikiTree.svelte';
	import CreateWikiModal from '$lib/components/wiki/CreateWikiModal.svelte';

	let { children } = $props();

	let createOpen = $state(false);
	let createParentId = $state<string | null>(null);
	let createIsFolder = $state(false);

	function openCreate(parentId: string | null, isFolder: boolean) {
		createParentId = parentId;
		createIsFolder = isFolder;
		createOpen = true;
	}
</script>

<Topbar crumbs={[{ label: 'Trackr Workspace', href: '/tasks' }, { label: 'Wiki' }]} />

<div class="flex flex-1 min-h-0 overflow-hidden">
	<WikiTree oncreate={openCreate} />
	<div class="flex-1 min-w-0 overflow-y-auto">
		{@render children()}
	</div>
</div>

<CreateWikiModal
	bind:open={createOpen}
	parentId={createParentId}
	isFolder={createIsFolder}
	onclose={() => (createOpen = false)}
/>
