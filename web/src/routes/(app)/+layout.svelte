<script lang="ts">
	import { goto } from '$app/navigation';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import PortalShell from '$lib/components/shell/PortalShell.svelte';
	import ImpersonationBanner from '$lib/components/shell/ImpersonationBanner.svelte';
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import CreateTaskModal from '$lib/components/tasks/CreateTaskModal.svelte';
	import CreateProjectModal from '$lib/components/projects/CreateProjectModal.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { getLocale, setLocale, isLocale } from '$lib/paraglide/runtime';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	$effect(() => {
		const p = data.preferences;
		if (!p || typeof document === 'undefined') return;
		const root = document.documentElement;
		root.dataset.theme = p.theme === 'system' ? 'dark' : p.theme;
		root.dataset.density = p.density;
		root.style.setProperty('--accent', p.accent);
		// Align the client locale store with the saved preference (cookie is
		// authoritative and already reconciled server-side; this is a no-op in
		// the common case but keeps the runtime consistent without a reload).
		if (isLocale(p.locale) && getLocale() !== p.locale) setLocale(p.locale, { reload: false });
	});

	let paletteOpen = $state(false);
	let createTaskOpen = $state(false);
	let createProjectOpen = $state(false);
	let logoutForm = $state<HTMLFormElement | null>(null);

	const perms = $derived(new Set(data.effectivePermissions ?? []));

	const hiddenPaletteIds = $derived(
		new Set<string>([
			...(perms.has('project.tasks.create') ? [] : ['create.task']),
			...(perms.has('project.create') ? [] : ['create.project']),
			// Wiki is Trackr-internal only.
			...(data.isTrackrTeam ? [] : ['nav.wiki'])
		])
	);

	function onKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			paletteOpen = !paletteOpen;
		}
	}

	$effect(() => {
		const open = () => (paletteOpen = true);
		window.addEventListener('trackr:open-palette', open);
		return () => window.removeEventListener('trackr:open-palette', open);
	});

	function handleAction(id: string) {
		switch (id) {
			case 'nav.week':
				void goto('/week');
				return;
			case 'nav.tasks':
				void goto('/tasks');
				return;
			case 'nav.projects':
				void goto('/projects');
				return;
			case 'nav.tickets':
				void goto('/tickets');
				return;
			case 'nav.wiki':
				void goto('/wiki');
				return;
			case 'create.task':
				if (perms.has('project.tasks.create')) createTaskOpen = true;
				return;
			case 'create.project':
				if (perms.has('project.create')) createProjectOpen = true;
				return;
			case 'me.signout':
				logoutForm?.submit();
				return;
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="flex flex-col h-screen overflow-hidden">
	{#if data.impersonator}
		<ImpersonationBanner
			targetName={data.user?.name ?? null}
			targetEmail={data.user?.email ?? ''}
			impersonatorName={data.impersonator.name}
			impersonatorEmail={data.impersonator.email}
		/>
	{/if}
	<div class="flex-1 min-h-0">
		{#if data.isPortalUser}
			<PortalShell>
				{@render children()}
			</PortalShell>
		{:else}
			<AppShell>
				{@render children()}
			</AppShell>
		{/if}
	</div>
</div>

{#if !data.isPortalUser}
	<CommandPalette
		open={paletteOpen}
		onclose={() => (paletteOpen = false)}
		onaction={handleAction}
		hiddenIds={hiddenPaletteIds}
	/>

	<CreateTaskModal
		open={createTaskOpen}
		onclose={() => (createTaskOpen = false)}
		users={data.users}
		projects={data.projects}
		currentUserId={data.currentUserId}
		memberProjectIds={Object.keys(data.memberRoles.projects)}
		allAccess={data.isTrackrTeam}
	/>

	<CreateProjectModal
		open={createProjectOpen}
		onclose={() => (createProjectOpen = false)}
		orgs={data.orgs}
	/>
{/if}

<form bind:this={logoutForm} method="post" action="/logout" class="hidden"></form>

<Toast />
