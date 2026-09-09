<script lang="ts">
	import { brandName } from '$lib/brand';
	import { page } from '$app/state';
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import NotesSidebar from '$lib/components/notes/NotesSidebar.svelte';
	import NewMeetingDialog from '$lib/components/notes/NewMeetingDialog.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	let meetingOpen = $state(false);
	const isIndex = $derived(page.route.id === '/(app)/notes');

	type Project = { id: string; key: string; name: string; color: string; status: string };
	const projects = $derived(((page.data as { projects?: Project[] }).projects ?? []) as Project[]);

	// Breadcrumb follows the open note up its sub-note chain (Notion-style
	// "Notes / Parent / Child"); notes outside the tree just show "Notes".
	const crumbs = $derived.by(() => {
		const base = [
			{ label: m.shell_workspace_crumb({ brand: brandName() }), href: '/tasks' },
			{ label: m.shell_nav_notes(), href: page.params.id ? '/notes' : undefined }
		];
		const id = page.params.id;
		if (!id) return base;
		const byId = new Map(data.mine.map((n) => [n.id, n]));
		const chain: { label: string; href?: string }[] = [];
		let cur = byId.get(id) ?? null;
		while (cur) {
			chain.unshift({
				label: cur.title || m.notes_untitled(),
				href: cur.id === id ? undefined : `/notes/${cur.id}`
			});
			cur = cur.parentId ? (byId.get(cur.parentId) ?? null) : null;
		}
		return [...base, ...chain];
	});
</script>

<Topbar {crumbs} />

<!--
	Below md there is no room for both panes: the index route shows only the
	list, every other route only the document (the crumb leads back to the list).
-->
<div class="flex min-h-0 flex-1 overflow-hidden">
	<div class="contents {isIndex ? '' : 'max-md:hidden'}">
		<NotesSidebar
			mine={data.mine}
			shared={data.shared}
			meetings={data.meetings}
			initial={data.sidebar}
			onNewMeeting={() => (meetingOpen = true)}
		/>
	</div>
	<div class="min-w-0 flex-1 overflow-y-auto {isIndex ? 'max-md:hidden' : ''}">
		{@render children()}
	</div>
</div>

<NewMeetingDialog
	bind:open={meetingOpen}
	{projects}
	templates={data.templates}
	tasks={data.tasks}
/>
