<script lang="ts">
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import ProjectCard from '$lib/components/projects/ProjectCard.svelte';
	import CreateProjectModal from '$lib/components/projects/CreateProjectModal.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let view = $state<'grid' | 'list'>('grid');
	let tab = $state<'active' | 'archived'>('active');
	let createOpen = $state(false);

	const visibleProjects = $derived(tab === 'active' ? data.projectsList : data.archivedProjectsList);
	const canCreate = $derived(
		(data.effectivePermissions ?? []).includes('project.create')
	);

	import { showToast } from '$lib/toast.svelte';
</script>

<svelte:head><title>Trackr · Projects</title></svelte:head>

<Topbar crumbs={[{ label: 'Trackr Workspace', href: '/tasks' }, { label: 'Projects' }]} />

<div class="flex-1 min-h-0 overflow-y-auto">
	<div class="px-6 py-6">
		<div class="flex items-end gap-4 mb-6">
			<div>
				<h1 class="text-[26px] font-semibold tracking-[-0.014em] text-text">Projects</h1>
				<p class="text-[13px] text-text-3 mt-1">
					{data.projectsList.length} active · {data.archivedProjectsList.length} archived
				</p>
			</div>
			<div class="ml-auto flex items-center gap-2">
				<div class="inline-flex items-center h-8 bg-surface border border-border rounded-lg p-0.5">
					<button
						type="button"
						onclick={() => (tab = 'active')}
						class="inline-flex items-center gap-1.5 px-2.5 h-full rounded-md text-[12.5px] transition-colors {tab === 'active' ? 'bg-bg-elev text-text' : 'text-text-3 hover:text-text'}"
					>
						Active
						<span class="font-mono text-[10.5px] text-text-3">{data.projectsList.length}</span>
					</button>
					<button
						type="button"
						onclick={() => (tab = 'archived')}
						class="inline-flex items-center gap-1.5 px-2.5 h-full rounded-md text-[12.5px] transition-colors {tab === 'archived' ? 'bg-bg-elev text-text' : 'text-text-3 hover:text-text'}"
					>
						Archived
						<span class="font-mono text-[10.5px] text-text-3"
							>{data.archivedProjectsList.length}</span
						>
					</button>
				</div>
				<div class="inline-flex items-center h-8 bg-surface border border-border rounded-lg p-0.5">
					<button
						type="button"
						onclick={() => (view = 'grid')}
						class="inline-flex items-center gap-1.5 px-2.5 h-full rounded-md text-[12.5px] {view === 'grid' ? 'bg-bg-elev text-text' : 'text-text-3 hover:text-text'}"
					>
						<Icon name="board" size={13} /> Grid
					</button>
					<button
						type="button"
						onclick={() => (view = 'list')}
						class="inline-flex items-center gap-1.5 px-2.5 h-full rounded-md text-[12.5px] {view === 'list' ? 'bg-bg-elev text-text' : 'text-text-3 hover:text-text'}"
					>
						<Icon name="list" size={13} /> List
					</button>
				</div>
				{#if canCreate}
					<Button variant="primary" size="sm" onclick={() => (createOpen = true)}>
						<Icon name="plus" size={13} /> New project
					</Button>
				{/if}
			</div>
		</div>

		{#if visibleProjects.length === 0}
			{#if tab === 'active'}
				<div class="border border-dashed border-border rounded-2xl flex flex-col items-center justify-center gap-3 py-20">
					<div class="w-12 h-12 grid place-items-center rounded-xl bg-surface border border-border text-text-3">
						<Icon name="folder" size={20} />
					</div>
					<div class="text-[15px] font-semibold text-text">No projects yet</div>
					<div class="text-[12.5px] text-text-3 max-w-[320px] text-center">
						Projects group related tasks and tickets. Create your first one to get started.
					</div>
					{#if canCreate}
						<Button variant="primary" size="sm" onclick={() => (createOpen = true)}>
							<Icon name="plus" size={13} /> Create a project
						</Button>
					{/if}
				</div>
			{:else}
				<div
					class="border border-dashed border-border rounded-2xl flex flex-col items-center justify-center gap-2 py-16 text-text-3"
				>
					<div
						class="w-10 h-10 grid place-items-center rounded-xl bg-surface border border-border"
					>
						<Icon name="folder" size={16} />
					</div>
					<div class="text-[13.5px] font-medium text-text">Nothing archived</div>
					<div class="text-[11.5px] text-text-4">Archived projects show up here.</div>
				</div>
			{/if}
		{:else if view === 'grid'}
			<div class="grid gap-4" style:grid-template-columns="repeat(auto-fill, minmax(340px, 1fr))">
				{#each visibleProjects as p (p.id)}
					<ProjectCard project={p} />
				{/each}
				{#if tab === 'active' && canCreate}
					<button
						type="button"
						onclick={() => (createOpen = true)}
						class="border border-dashed border-border rounded-2xl flex flex-col items-center justify-center gap-2 py-12 text-text-3 hover:text-text hover:border-border-strong transition-colors"
					>
						<div
							class="w-10 h-10 grid place-items-center rounded-xl bg-surface border border-border"
						>
							<Icon name="plus" size={16} />
						</div>
						<div class="text-[13.5px] font-medium">New project</div>
						<div class="text-[11.5px] text-text-4">Start a workspace from scratch</div>
					</button>
				{/if}
			</div>
		{:else}
			<div class="bg-bg-elev border border-border rounded-2xl overflow-hidden">
				<div
					class="grid items-center gap-3 px-5 py-2.5 text-[11px] uppercase tracking-[0.08em] text-text-4 border-b border-border"
					style:grid-template-columns="1.5fr 1fr 1fr 1fr 1fr 1fr"
				>
					<span>Project</span>
					<span>Lead</span>
					<span>Status</span>
					<span>Key</span>
					<span>Members</span>
					<span>Updated</span>
				</div>
				{#each visibleProjects as p (p.id)}
					<a
						href="/projects/{p.id}"
						class="grid items-center gap-3 px-5 py-3 border-b border-border last:border-b-0 hover:bg-[var(--row-hover)] transition-colors text-[13px]"
						style:grid-template-columns="1.5fr 1fr 1fr 1fr 1fr 1fr"
					>
						<span class="flex items-center gap-2.5 min-w-0">
							<span
								class="w-7 h-7 rounded-md grid place-items-center text-white font-semibold text-[12px] shrink-0"
								style:background="linear-gradient(140deg, {p.color}, color-mix(in oklch, {p.color} 70%, #000) 85%)"
							>{p.icon}</span>
							<span class="truncate font-medium">{p.name}</span>
						</span>
						<span class="text-text-2 truncate">{p.lead?.name ?? '—'}</span>
						<span class="text-text-2 capitalize">{p.status.replace('_', ' ')}</span>
						<span class="font-mono text-text-3">{p.key}</span>
						<span class="text-text-3 font-mono">{p.members.length}</span>
						<span class="text-text-3">{p.updatedAt.toISOString().slice(0, 10)}</span>
					</a>
				{/each}
			</div>
		{/if}
	</div>
</div>

<CreateProjectModal
	open={createOpen}
	onclose={() => (createOpen = false)}
	orgs={data.orgs}
	oncreated={(name) => showToast('ok', `Created ${name}.`)}
	onerror={(msg) => showToast('err', msg)}
/>
