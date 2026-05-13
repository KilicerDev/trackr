<script lang="ts">
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Button from '$lib/components/Button.svelte';
	import IconButton from '$lib/components/IconButton.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { LOG_EVENTS, LOG_EVENT_TYPES, LOG_KINDS, userById } from '$lib/data';
	import type { LogEvent } from '$lib/types';

	let kind = $state('all');
	let range = $state('30');
	let search = $state('');
	let selected = $state<LogEvent | null>(null);

	let events = $derived.by(() => {
		let list = LOG_EVENTS;
		if (kind !== 'all') list = list.filter((e) => LOG_EVENT_TYPES[e.type]?.kind === kind);
		if (search) {
			const q = search.toLowerCase();
			list = list.filter((e) => e.target.toLowerCase().includes(q) || e.type.includes(q));
		}
		return list;
	});

	const ranges = [
		{ id: '1', label: '24h' },
		{ id: '7', label: '7 days' },
		{ id: '30', label: '30 days' },
		{ id: 'all', label: 'All time' }
	];
</script>

<svelte:head><title>Trackr · Audit Log</title></svelte:head>

<Topbar crumbs={[{ label: 'Trackr Workspace', href: '/tasks' }, { label: 'Audit Log' }]} />

<div class="flex-1 min-h-0 overflow-y-auto">
	<div class="px-6 py-6">
		<div class="flex items-end gap-4 mb-6">
			<div>
				<h1 class="text-[26px] font-semibold tracking-[-0.014em]">Audit Log</h1>
				<p class="text-[12.5px] text-text-3 mt-1 max-w-xl">
					Every member action across the workspace. Retained for 90 days.
				</p>
			</div>
			<div class="ml-auto">
				<Button variant="default" size="sm"><Icon name="logs" size={13} /> Export CSV</Button>
			</div>
		</div>

		<div class="flex items-center gap-2.5 mb-4 flex-wrap">
			<div class="inline-flex items-center h-8 bg-surface border border-border rounded-lg p-0.5">
				{#each LOG_KINDS as k (k.id)}
					<button
						type="button"
						onclick={() => (kind = k.id)}
						class="px-2.5 h-full rounded-md text-[12.5px] {kind === k.id ? 'bg-bg-elev text-text shadow-sm' : 'text-text-3 hover:text-text'}"
					>
						{k.label}
					</button>
				{/each}
			</div>
			<div class="w-px h-5 bg-border"></div>
			<div class="inline-flex items-center h-8 bg-surface border border-border rounded-lg p-0.5">
				{#each ranges as r (r.id)}
					<button
						type="button"
						onclick={() => (range = r.id)}
						class="px-2.5 h-full rounded-md text-[12.5px] {range === r.id ? 'bg-bg-elev text-text shadow-sm' : 'text-text-3 hover:text-text'}"
					>
						{r.label}
					</button>
				{/each}
			</div>
			<div class="ml-auto relative">
				<span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-3 pointer-events-none">
					<Icon name="search" size={13} />
				</span>
				<input
					type="text"
					bind:value={search}
					placeholder="Search events…"
					class="h-8 pl-8 pr-3 rounded-lg bg-surface border border-border text-[12.5px] outline-none focus:border-border-strong w-56"
				/>
			</div>
		</div>

		<div class="bg-bg-elev border border-border rounded-2xl overflow-hidden">
			{#if events.length === 0}
				<EmptyState icon="logs" title="No events match your filters" />
			{:else}
				<div
					class="grid items-center gap-3 px-5 h-9 text-[11px] uppercase tracking-[0.08em] text-text-4 border-b border-border"
					style:grid-template-columns="1.6fr 1fr 2fr 1.4fr 1.2fr 30px"
				>
					<span>Event</span>
					<span>Actor</span>
					<span>Target</span>
					<span>IP / Device</span>
					<span>When</span>
					<span></span>
				</div>
				{#each events as e (e.id)}
					{@const meta = LOG_EVENT_TYPES[e.type]}
					{@const actor = userById(e.actor)}
					<button
						type="button"
						onclick={() => (selected = e)}
						class="grid items-center gap-3 w-full px-5 py-2.5 border-b border-border/40 last:border-b-0 hover:bg-[var(--row-hover)] transition-colors text-[12.5px] text-left"
						style:grid-template-columns="1.6fr 1fr 2fr 1.4fr 1.2fr 30px"
					>
						<span class="flex items-center gap-2 min-w-0">
							<span class="w-6 h-6 rounded-md grid place-items-center shrink-0" style:background={meta.color + '24'} style:color={meta.color}>
								<Icon name={meta.icon} size={13} />
							</span>
							<span class="text-text truncate">{meta.label}</span>
						</span>
						<span class="flex items-center gap-1.5 min-w-0">
							{#if actor}
								<Avatar user={actor} size={18} />
								<span class="truncate">{actor.name.split(' ')[0]}</span>
							{:else}
								<span class="w-[18px] h-[18px] rounded-full bg-surface-2 grid place-items-center text-text-3 text-[10px]">?</span>
								<span class="text-text-3">Anon</span>
							{/if}
						</span>
						<span class="text-text-2 truncate">{e.target}</span>
						<span class="text-text-3 min-w-0">
							<span class="font-mono">{e.ip}</span>
							<span class="block text-[11px] text-text-4 truncate">{e.device}</span>
						</span>
						<span class="text-text-3 font-mono">{e.at}</span>
						<span class="text-text-3 opacity-0 group-hover:opacity-100"><Icon name="chevron-r" size={11} /></span>
					</button>
				{/each}
			{/if}
		</div>
	</div>
</div>

<Drawer open={!!selected} onclose={() => (selected = null)} width={420}>
	{#if selected}
		{@const meta = LOG_EVENT_TYPES[selected.type]}
		{@const actor = userById(selected.actor)}
		<div class="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-border">
			<span class="font-mono text-[10.5px] uppercase tracking-[0.08em] text-text-4">Event · {selected.id.toUpperCase()}</span>
			<div class="ml-auto">
				<IconButton size={28} ariaLabel="Close" onclick={() => (selected = null)}><Icon name="x" size={14} /></IconButton>
			</div>
		</div>
		<div class="flex-1 overflow-y-auto px-5 py-5">
			<div class="flex items-center gap-3 mb-5">
				<span class="w-12 h-12 rounded-xl grid place-items-center shrink-0" style:background={meta.color + '24'} style:color={meta.color}>
					<Icon name={meta.icon} size={20} />
				</span>
				<div class="min-w-0">
					<div class="text-[16px] font-semibold text-text">{meta.label}</div>
					<div class="text-[11.5px] font-mono text-text-3">{selected.type}</div>
				</div>
			</div>

			<div class="grid grid-cols-[100px_1fr] gap-y-3 gap-x-3 text-[12.5px] mb-6">
				<div class="text-text-4">Actor</div>
				<div class="flex items-center gap-1.5">
					{#if actor}<Avatar user={actor} size={16} /><span>{actor.name}</span>{:else}<span class="text-text-3">Anonymous</span>{/if}
				</div>
				<div class="text-text-4">Target</div>
				<div class="text-text break-all">{selected.target}</div>
				<div class="text-text-4">Timestamp</div>
				<div class="font-mono text-text">{selected.at}</div>
				<div class="text-text-4">IP</div>
				<div class="font-mono">{selected.ip}</div>
				<div class="text-text-4">Device</div>
				<div>{selected.device}</div>
				<div class="text-text-4">Category</div>
				<div class="capitalize" style:color={meta.color}>{meta.kind}</div>
			</div>

			<div>
				<div class="text-[10.5px] uppercase tracking-[0.08em] text-text-4 mb-2">Raw payload</div>
				<pre class="text-[11.5px] font-mono bg-surface border border-border rounded-lg p-3 overflow-x-auto text-text-2">{JSON.stringify(selected, null, 2)}</pre>
			</div>
		</div>
	{/if}
</Drawer>
