<script lang="ts">
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Button from '$lib/components/Button.svelte';
	import { page } from '$app/state';

	type LayoutData = {
		user?: { id: string; name: string; email: string };
		users?: { id: string; status: string }[];
	};
	const me = $derived((page.data as LayoutData).user);
	const memberCount = $derived(((page.data as LayoutData).users ?? []).length);
	let workspaceName = $state('Trackr');
</script>

<svelte:head><title>Trackr · System Settings</title></svelte:head>

<Topbar crumbs={[{ label: 'Trackr Workspace', href: '/tasks' }, { label: 'System Settings' }]} />

<div class="flex-1 min-h-0 overflow-y-auto">
	<div class="px-6 py-6 max-w-[820px]">
		<h1 class="text-[26px] font-semibold tracking-[-0.014em] mb-1">System Settings</h1>
		<p class="text-[12.5px] text-text-3 mb-6">Workspace-wide preferences and integrations.</p>

		<section class="bg-bg-elev border border-border rounded-2xl p-5 mb-5">
			<div class="text-[11px] uppercase tracking-[0.08em] text-text-4 mb-3">Workspace</div>
			<div class="grid grid-cols-[160px_1fr] items-center gap-y-3 gap-x-4 text-[13px]">
				<label for="ws-name" class="text-text-3">Name</label>
				<input
					id="ws-name"
					bind:value={workspaceName}
					class="bg-surface border border-border rounded-lg px-3 py-2 outline-none focus:border-border-strong"
				/>
				<div class="text-text-3">Owner</div>
				<div>{me?.name ?? '—'} <span class="text-text-3 font-mono">· {me?.email ?? ''}</span></div>
				<div class="text-text-3">Members</div>
				<div>{memberCount} <span class="text-text-3">— manage in <a href="/admin/users" class="text-accent hover:underline">User Management</a></span></div>
			</div>
		</section>

		<section class="bg-bg-elev border border-border rounded-2xl p-5 mb-5">
			<div class="text-[11px] uppercase tracking-[0.08em] text-text-4 mb-3">Integrations</div>
			<div class="space-y-2">
				{#each [['Slack', 'Send task updates to a channel'], ['GitHub', 'Link PRs to tasks'], ['Linear', 'Two-way sync (read-only)']] as [name, desc] (name)}
					<div class="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface border border-border">
						<span class="w-8 h-8 rounded-md grid place-items-center bg-bg-elev border border-border text-text-3"><Icon name="link" size={14} /></span>
						<div class="flex-1 min-w-0">
							<div class="text-[13px] font-medium">{name}</div>
							<div class="text-[11.5px] text-text-3">{desc}</div>
						</div>
						<Button size="sm" variant="default">Connect</Button>
					</div>
				{/each}
			</div>
		</section>

		<section class="bg-bg-elev border border-border rounded-2xl p-5">
			<div class="text-[11px] uppercase tracking-[0.08em] text-text-4 mb-3">Danger zone</div>
			<div class="flex items-center gap-3 p-3 rounded-lg border border-[#ef7a6d]/30 bg-[#ef7a6d]/5">
				<Icon name="shield" size={16} class="text-[#ef7a6d]" />
				<div class="flex-1 min-w-0">
					<div class="text-[13px] font-medium">Delete workspace</div>
					<div class="text-[11.5px] text-text-3">Removes all projects, tasks, and members. Cannot be undone.</div>
				</div>
				<Button size="sm">Delete</Button>
			</div>
		</section>
	</div>
</div>
