<script lang="ts">
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import CreateOrganizationModal from '$lib/components/admin/CreateOrganizationModal.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let createOpen = $state(false);
	let toast = $state<{ kind: 'ok' | 'err'; msg: string } | null>(null);
	function showToast(kind: 'ok' | 'err', msg: string) {
		toast = { kind, msg };
		setTimeout(() => {
			if (toast?.msg === msg) toast = null;
		}, 3500);
	}

	let search = $state('');
	let visible = $derived.by(() => {
		if (!search) return data.orgs;
		const q = search.toLowerCase();
		return data.orgs.filter(
			(o) => o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q)
		);
	});

	function initials(name: string): string {
		return (
			name
				.split(/\s+/)
				.map((p) => p[0])
				.filter(Boolean)
				.slice(0, 2)
				.join('')
				.toUpperCase() || '·'
		);
	}

	function fmtDate(d: Date | string): string {
		const dt = typeof d === 'string' ? new Date(d) : d;
		return dt.toISOString().slice(0, 10);
	}
</script>

<svelte:head><title>Trackr · Organizations</title></svelte:head>

<Topbar crumbs={[{ label: 'Trackr Workspace', href: '/tasks' }, { label: 'Organizations' }]} />

<div class="flex-1 min-h-0 overflow-y-auto">
	<div class="px-6 py-6">
		<div class="flex items-end gap-4 mb-6">
			<div>
				<h1 class="text-[26px] font-semibold tracking-[-0.014em] text-text">Organizations</h1>
				<p class="text-[12.5px] text-text-3 mt-1">
					{data.orgs.length} organization{data.orgs.length === 1 ? '' : 's'} · projects can either
					belong to one or stay internal
				</p>
			</div>
			<div class="ml-auto flex items-center gap-2">
				<div class="relative">
					<span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-3 pointer-events-none">
						<Icon name="search" size={13} />
					</span>
					<input
						type="text"
						bind:value={search}
						placeholder="Search…"
						class="h-8 pl-8 pr-3 rounded-lg bg-surface border border-border text-[12.5px] outline-none focus:border-border-strong w-56"
					/>
				</div>
				<Button variant="primary" size="sm" onclick={() => (createOpen = true)}>
					<Icon name="plus" size={13} /> New organization
				</Button>
			</div>
		</div>

		{#if data.orgs.length === 0}
			<EmptyState
				icon="org"
				title="No organizations yet"
				hint="Create one to group projects by client. Internal projects can stay org-less."
			/>
		{:else}
			<div class="bg-bg-elev border border-border rounded-2xl overflow-hidden">
				<div
					class="grid items-center gap-3 px-5 h-9 text-[11px] uppercase tracking-[0.08em] text-text-4 border-b border-border"
					style:grid-template-columns="1.6fr 1fr 80px 1fr 36px"
				>
					<span>Organization</span>
					<span>Slug</span>
					<span class="text-right">Projects</span>
					<span>Created</span>
					<span></span>
				</div>
				{#if visible.length === 0}
					<div class="px-5 py-10 text-center text-[12.5px] text-text-3">
						No organizations match your search.
					</div>
				{/if}
				{#each visible as o (o.id)}
					<a
						href="/admin/organizations/{o.id}"
						class="grid items-center gap-3 px-5 py-2.5 border-b border-border/40 last:border-b-0 hover:bg-[var(--row-hover)] transition-colors text-[13px] {o.archivedAt
							? 'opacity-55 hover:opacity-100'
							: ''}"
						style:grid-template-columns="1.6fr 1fr 80px 1fr 36px"
					>
						<span class="flex items-center gap-2.5 min-w-0">
							<span
								class="w-8 h-8 rounded-lg grid place-items-center text-white font-semibold text-[12.5px] shrink-0"
								style:background="linear-gradient(140deg, {o.color}, color-mix(in oklch, {o.color} 70%, #000) 85%)"
								style:box-shadow="0 1px 0 rgba(255,255,255,0.16) inset"
							>{initials(o.name)}</span>
							<span class="min-w-0">
								<span class="block font-medium text-text truncate">{o.name}</span>
								{#if o.description}
									<span class="block text-[11.5px] text-text-3 truncate">{o.description}</span>
								{/if}
							</span>
						</span>
						<span class="font-mono text-[12px] text-text-3 truncate">{o.slug}</span>
						<span class="font-mono text-[12px] text-text text-right">{o.projectCount}</span>
						<span class="text-text-3 font-mono text-[12px]">{fmtDate(o.createdAt)}</span>
						<span class="text-text-3 grid place-items-center"
							><Icon name="chevron-r" size={12} /></span
						>
					</a>
				{/each}
			</div>
		{/if}
	</div>
</div>

{#if toast}
	<div
		class="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-3.5 py-2 rounded-lg border text-[13px] backdrop-blur-md shadow-lg"
		style:background={toast.kind === 'ok' ? 'rgba(127,200,169,0.12)' : 'rgba(239,79,94,0.12)'}
		style:border-color={toast.kind === 'ok' ? 'rgba(127,200,169,0.35)' : 'rgba(239,79,94,0.35)'}
		style:color={toast.kind === 'ok' ? '#7fc8a9' : '#ef7a6d'}
	>
		{toast.msg}
	</div>
{/if}

<CreateOrganizationModal
	open={createOpen}
	onclose={() => (createOpen = false)}
	oncreated={(n) => showToast('ok', `Created ${n}.`)}
	onerror={(m) => showToast('err', m)}
/>
