<script lang="ts">
	import { page } from '$app/state';
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import NotesSidebar from '$lib/components/notes/NotesSidebar.svelte';
	import NewMeetingDialog from '$lib/components/notes/NewMeetingDialog.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	let meetingOpen = $state(false);

	type Project = { id: string; key: string; name: string; color: string; status: string };
	const projects = $derived(((page.data as { projects?: Project[] }).projects ?? []) as Project[]);
</script>

<Topbar
	crumbs={[{ label: m.notes_breadcrumb_workspace(), href: '/tasks' }, { label: m.shell_nav_notes() }]}
/>

<div class="flex flex-1 min-h-0 overflow-hidden">
	<NotesSidebar
		mine={data.mine}
		shared={data.shared}
		meetings={data.meetings}
		initialTab={data.viewTab}
		onNewMeeting={() => (meetingOpen = true)}
	/>
	<div class="flex-1 min-w-0 overflow-y-auto">
		{@render children()}
	</div>
</div>

<NewMeetingDialog
	bind:open={meetingOpen}
	{projects}
	templates={data.templates}
	tasks={data.tasks}
/>
