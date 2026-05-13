<script lang="ts">
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import ProjectCard from '$lib/components/projects/ProjectCard.svelte';
	import { TRACKR_PROJECTS } from '$lib/data';
	import type { ProjectId } from '$lib/types';

	let view = $state<'grid' | 'list'>('grid');
	const projectIds = Object.keys(TRACKR_PROJECTS) as ProjectId[];
</script>

<svelte:head><title>Trackr · Projects</title></svelte:head>

<Topbar crumbs={[{ label: 'Trackr Workspace', href: '/tasks' }, { label: 'Projects' }]} />

<div class="flex-1 min-h-0 overflow-y-auto">
	<div class="px-6 py-6">
		<div class="flex items-end gap-4 mb-6">
			<div>
				<h1 class="text-[26px] font-semibold tracking-[-0.014em] text-text">Projects</h1>
				<p class="text-[13px] text-text-3 mt-1">{projectIds.length} active workspaces</p>
			</div>
			<div class="ml-auto flex items-center gap-2">
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
				<Button variant="primary" size="sm">
					<Icon name="plus" size={13} /> New project
				</Button>
			</div>
		</div>

		{#if view === 'grid'}
			<div class="grid gap-4" style:grid-template-columns="repeat(auto-fill, minmax(340px, 1fr))">
				{#each projectIds as id (id)}
					<ProjectCard {id} />
				{/each}
				<button
					type="button"
					class="border border-dashed border-border rounded-2xl flex flex-col items-center justify-center gap-2 py-12 text-text-3 hover:text-text hover:border-border-strong transition-colors"
				>
					<div class="w-10 h-10 grid place-items-center rounded-xl bg-surface border border-border">
						<Icon name="plus" size={16} />
					</div>
					<div class="text-[13.5px] font-medium">New project</div>
					<div class="text-[11.5px] text-text-4">Start a workspace from scratch</div>
				</button>
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
					<span>Progress</span>
					<span>Members</span>
					<span>Updated</span>
				</div>
				{#each projectIds as id (id)}
					{@const p = TRACKR_PROJECTS[id]}
					<a
						href="/projects/{id}"
						class="grid items-center gap-3 px-5 py-3 border-b border-border last:border-b-0 hover:bg-[var(--row-hover)] transition-colors text-[13px]"
						style:grid-template-columns="1.5fr 1fr 1fr 1fr 1fr 1fr"
					>
						<span class="flex items-center gap-2.5 min-w-0">
							<span class="w-7 h-7 rounded-md grid place-items-center text-white font-semibold text-[12px] shrink-0" style:background={p.color}>{p.icon}</span>
							<span class="truncate font-medium">{p.name}</span>
						</span>
						<span class="text-text-2">{p.lead}</span>
						<span class="text-text-2 capitalize">{p.status.replace('_', ' ')}</span>
						<span class="text-text-3 font-mono">—</span>
						<span class="text-text-3 font-mono">{p.members.length}</span>
						<span class="text-text-3">{p.updated}</span>
					</a>
				{/each}
			</div>
		{/if}
	</div>
</div>
