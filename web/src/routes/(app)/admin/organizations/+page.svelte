<script lang="ts">
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import CreateOrganizationModal from '$lib/components/admin/CreateOrganizationModal.svelte';
	import { m } from '$lib/paraglide/messages';
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

<svelte:head><title>{m.admin_organizations_page_title()}</title></svelte:head>

<Topbar
	crumbs={[
		{ label: m.admin_crumb_workspace(), href: '/tasks' },
		{ label: m.admin_organizations_title() }
	]}
/>

<div class="min-h-0 flex-1 overflow-y-auto">
	<div class="px-6 py-6">
		<div class="mb-6 flex items-end gap-4">
			<div>
				<h1 class="text-[26px] font-semibold tracking-[-0.014em] text-text">
					{m.admin_organizations_title()}
				</h1>
				<p class="mt-1 text-[14px] text-text-3">
					{m.admin_organizations_subtitle({ count: data.orgs.length })}
				</p>
			</div>
			<div class="ml-auto flex items-center gap-2">
				<div class="relative">
					<span class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-3">
						<Icon name="search" size={14} />
					</span>
					<input
						type="text"
						bind:value={search}
						placeholder={m.common_search()}
						class="h-8 w-56 rounded-lg border border-border bg-surface pr-3 pl-8 text-[14px] outline-none focus:border-border-strong"
					/>
				</div>
				<Button variant="primary" size="sm" onclick={() => (createOpen = true)}>
					<Icon name="plus" size={14} />
					{m.admin_org_new()}
				</Button>
			</div>
		</div>

		{#if data.orgs.length === 0}
			<EmptyState icon="org" title={m.admin_org_empty_title()} hint={m.admin_org_empty_hint()} />
		{:else}
			<div class="overflow-hidden rounded-2xl border border-border bg-bg-elev">
				<div
					class="grid h-9 items-center gap-3 border-b border-border px-5 text-[12px] tracking-[0.08em] text-text-4 uppercase"
					style:grid-template-columns="1.6fr 1fr 80px 1fr 36px"
				>
					<span>{m.admin_organization()}</span>
					<span>{m.admin_slug()}</span>
					<span class="text-right">{m.admin_projects()}</span>
					<span>{m.admin_created()}</span>
					<span></span>
				</div>
				{#if visible.length === 0}
					<div class="px-5 py-10 text-center text-[14px] text-text-3">
						{m.admin_org_no_search_match()}
					</div>
				{/if}
				{#each visible as o (o.id)}
					<a
						href="/admin/organizations/{o.id}"
						class="grid items-center gap-3 border-b border-border/40 px-5 py-2.5 text-[14px] transition-colors last:border-b-0 hover:bg-[var(--row-hover)] {o.archivedAt
							? 'opacity-55 hover:opacity-100'
							: ''}"
						style:grid-template-columns="1.6fr 1fr 80px 1fr 36px"
					>
						<span class="flex min-w-0 items-center gap-2.5">
							<span
								class="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[14px] font-semibold text-white shadow-edge"
								style:background="linear-gradient(140deg, {o.color}, color-mix(in oklch, {o.color} 70%,
								#000) 85%)">{initials(o.name)}</span
							>
							<span class="min-w-0">
								<span class="block truncate font-medium text-text">{o.name}</span>
								{#if o.description}
									<span class="block truncate text-[12px] text-text-3">{o.description}</span>
								{/if}
							</span>
						</span>
						<span class="truncate font-mono text-[13px] text-text-3">{o.slug}</span>
						<span class="text-right font-mono text-[13px] text-text">{o.projectCount}</span>
						<span class="font-mono text-[13px] text-text-3">{fmtDate(o.createdAt)}</span>
						<span class="grid place-items-center text-text-3"
							><Icon name="chevron-r" size={13} /></span
						>
					</a>
				{/each}
			</div>
		{/if}
	</div>
</div>

{#if toast}
	<div
		class="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg border px-3.5 py-2 text-[14px] shadow-lg backdrop-blur-md"
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
	oncreated={(n) => showToast('ok', m.admin_org_created_toast({ name: n }))}
	onerror={(m) => showToast('err', m)}
/>
