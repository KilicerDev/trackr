<script lang="ts">
	import { goto } from '$app/navigation';
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Button from '$lib/components/Button.svelte';
	import IconButton from '$lib/components/IconButton.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { showToast } from '$lib/toast.svelte';
	import { LOG_EVENT_TYPES, LOG_KINDS } from '$lib/data';
	import { m } from '$lib/paraglide/messages';
	import { logKindLabel, logEventLabel } from '$lib/labels';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	type Row = PageData['events'][number];

	// Filter state, seeded from the loaded query and re-synced whenever a new page
	// loads (filter change / navigation). Changing kind/range/search navigates,
	// which re-runs the server load.
	let kind = $state(data.filters.kind);
	let range = $state(data.filters.range);
	let search = $state(data.filters.q);

	// Appended pages from "Load more" (the first page comes from `data`).
	let appended = $state<Row[]>([]);
	let extraActors = $state<Record<string, PageData['actors'][string]>>({});
	let cursor = $state<string | null>(data.nextCursor);
	let more = $state(data.hasMore);
	let loading = $state(false);
	let selected = $state<Row | null>(null);

	$effect(() => {
		// Re-sync to the freshly loaded page (depends on the new data identity).
		kind = data.filters.kind;
		range = data.filters.range;
		search = data.filters.q;
		appended = [];
		extraActors = {};
		cursor = data.nextCursor;
		more = data.hasMore;
	});

	const rows = $derived<Row[]>([...data.events, ...appended]);
	const actors = $derived({ ...data.actors, ...extraActors });

	function queryString(extra?: Record<string, string>): string {
		const parts: string[] = [];
		if (kind !== 'all') parts.push(`kind=${encodeURIComponent(kind)}`);
		if (range !== '30') parts.push(`range=${encodeURIComponent(range)}`);
		if (search.trim()) parts.push(`q=${encodeURIComponent(search.trim())}`);
		if (extra) for (const [k, v] of Object.entries(extra)) parts.push(`${k}=${encodeURIComponent(v)}`);
		return parts.join('&');
	}

	function navigate() {
		const qs = queryString();
		goto(qs ? `?${qs}` : '?', { keepFocus: true, noScroll: true });
	}

	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	function onSearchInput() {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(navigate, 300);
	}

	async function loadMore() {
		if (!cursor || loading) return;
		loading = true;
		try {
			const res = await fetch(`/admin/logs/data?${queryString({ before: cursor })}`);
			if (!res.ok) throw new Error('failed');
			const next = (await res.json()) as {
				events: Row[];
				actors: Record<string, PageData['actors'][string]>;
				hasMore: boolean;
				nextCursor: string | null;
			};
			appended = [...appended, ...next.events];
			extraActors = { ...extraActors, ...next.actors };
			cursor = next.nextCursor;
			more = next.hasMore;
		} catch {
			showToast('err', m.admin_logs_load_more_failed());
		} finally {
			loading = false;
		}
	}

	const exportHref = $derived(`/admin/logs/export?${queryString()}`);
</script>

<svelte:head><title>{m.admin_logs_page_title()}</title></svelte:head>

<Topbar crumbs={[{ label: m.admin_crumb_workspace(), href: '/tasks' }, { label: m.admin_logs_title() }]} />

<div class="flex-1 min-h-0 overflow-y-auto">
	<div class="px-6 py-6">
		<div class="flex items-end gap-4 mb-6">
			<div>
				<h1 class="text-[26px] font-semibold tracking-[-0.014em]">{m.admin_logs_title()}</h1>
				<p class="text-[12.5px] text-text-3 mt-1 max-w-xl">
					{m.admin_logs_subtitle()}
				</p>
			</div>
			<div class="ml-auto">
				<Button variant="default" size="sm" onclick={() => (window.location.href = exportHref)}>
					<Icon name="logs" size={13} /> {m.admin_logs_export_csv()}
				</Button>
			</div>
		</div>

		<div class="flex items-center gap-2.5 mb-4 flex-wrap">
			<div class="inline-flex items-center h-8 bg-surface border border-border rounded-lg p-0.5">
				{#each LOG_KINDS as k (k.id)}
					<button
						type="button"
						onclick={() => { kind = k.id; navigate(); }}
						class="px-2.5 h-full rounded-md text-[12.5px] {kind === k.id ? 'bg-bg-elev text-text shadow-sm' : 'text-text-3 hover:text-text'}"
					>
						{logKindLabel(k.id)}
					</button>
				{/each}
			</div>
			<div class="w-px h-5 bg-border"></div>
			<div class="inline-flex items-center h-8 bg-surface border border-border rounded-lg p-0.5">
				{#each [{ id: '1', label: m.admin_logs_range_24h() }, { id: '7', label: m.admin_logs_range_7days() }, { id: '30', label: m.admin_logs_range_30days() }, { id: 'all', label: m.admin_logs_range_all_time() }] as r (r.id)}
					<button
						type="button"
						onclick={() => { range = r.id; navigate(); }}
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
					oninput={onSearchInput}
					placeholder={m.admin_logs_search_placeholder()}
					class="h-8 pl-8 pr-3 rounded-lg bg-surface border border-border text-[12.5px] outline-none focus:border-border-strong w-56"
				/>
			</div>
		</div>

		<div class="bg-bg-elev border border-border rounded-2xl overflow-hidden">
			{#if rows.length === 0}
				<EmptyState icon="logs" title={m.admin_logs_empty_title()} />
			{:else}
				<div
					class="grid items-center gap-3 px-5 h-9 text-[11px] uppercase tracking-[0.08em] text-text-4 border-b border-border"
					style:grid-template-columns="1.6fr 1fr 2fr 1.4fr 1.2fr 30px"
				>
					<span>{m.admin_logs_col_event()}</span>
					<span>{m.admin_logs_col_actor()}</span>
					<span>{m.admin_logs_col_target()}</span>
					<span>{m.admin_logs_col_ip_device()}</span>
					<span>{m.admin_logs_col_when()}</span>
					<span></span>
				</div>
				{#each rows as e (e.id)}
					{@const meta = LOG_EVENT_TYPES[e.type] ?? { icon: 'logs', color: '#9aa4b2', kind: 'settings', label: e.type }}
					{@const actor = e.actor ? actors[e.actor] : undefined}
					<button
						type="button"
						onclick={() => (selected = e)}
						class="group grid items-center gap-3 w-full px-5 py-2.5 border-b border-border/40 last:border-b-0 hover:bg-[var(--row-hover)] transition-colors text-[12.5px] text-left"
						style:grid-template-columns="1.6fr 1fr 2fr 1.4fr 1.2fr 30px"
					>
						<span class="flex items-center gap-2 min-w-0">
							<span class="w-6 h-6 rounded-md grid place-items-center shrink-0" style:background={meta.color + '24'} style:color={meta.color}>
								<Icon name={meta.icon} size={13} />
							</span>
							<span class="text-text truncate">{logEventLabel(e.type)}</span>
						</span>
						<span class="flex items-center gap-1.5 min-w-0">
							{#if actor}
								<Avatar user={actor} size={18} />
								<span class="truncate">{actor.name.split(' ')[0]}</span>
							{:else}
								<span class="w-[18px] h-[18px] rounded-full bg-surface-2 grid place-items-center text-text-3 text-[10px]">?</span>
								<span class="text-text-3 truncate">{e.actorLabel ?? m.admin_logs_anon()}</span>
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
				{#if more}
					<div class="px-5 py-3 border-t border-border flex justify-center">
						<Button variant="default" size="sm" onclick={loadMore} disabled={loading}>
							{loading ? m.common_loading() : m.admin_logs_load_more()}
						</Button>
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>

<Drawer open={!!selected} onclose={() => (selected = null)} width={420}>
	{#if selected}
		{@const meta = LOG_EVENT_TYPES[selected.type] ?? { icon: 'logs', color: '#9aa4b2', kind: 'settings', label: selected.type }}
		{@const actor = selected.actor ? actors[selected.actor] : undefined}
		<div class="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-border">
			<span class="font-mono text-[10.5px] uppercase tracking-[0.08em] text-text-4">{m.admin_logs_event_label({ id: selected.id.slice(0, 8).toUpperCase() })}</span>
			<div class="ml-auto">
				<IconButton size={28} ariaLabel={m.common_close()} onclick={() => (selected = null)}><Icon name="x" size={14} /></IconButton>
			</div>
		</div>
		<div class="flex-1 overflow-y-auto px-5 py-5">
			<div class="flex items-center gap-3 mb-5">
				<span class="w-12 h-12 rounded-xl grid place-items-center shrink-0" style:background={meta.color + '24'} style:color={meta.color}>
					<Icon name={meta.icon} size={20} />
				</span>
				<div class="min-w-0">
					<div class="text-[16px] font-semibold text-text">{logEventLabel(selected.type)}</div>
					<div class="text-[11.5px] font-mono text-text-3">{selected.type}</div>
				</div>
			</div>

			<div class="grid grid-cols-[100px_1fr] gap-y-3 gap-x-3 text-[12.5px] mb-6">
				<div class="text-text-4">{m.admin_logs_col_actor()}</div>
				<div class="flex items-center gap-1.5">
					{#if actor}<Avatar user={actor} size={16} /><span>{actor.name}</span>{:else}<span class="text-text-3">{selected.actorLabel ?? m.admin_logs_anonymous()}</span>{/if}
				</div>
				<div class="text-text-4">{m.admin_logs_col_target()}</div>
				<div class="text-text break-all">{selected.target || '—'}</div>
				<div class="text-text-4">{m.admin_logs_timestamp()}</div>
				<div class="font-mono text-text">{selected.at}</div>
				<div class="text-text-4">{m.admin_logs_ip()}</div>
				<div class="font-mono">{selected.ip}</div>
				<div class="text-text-4">{m.admin_logs_device()}</div>
				<div>{selected.device}</div>
				<div class="text-text-4">{m.admin_logs_category()}</div>
				<div class="capitalize" style:color={meta.color}>{logKindLabel(meta.kind)}</div>
			</div>

			<div>
				<div class="text-[10.5px] uppercase tracking-[0.08em] text-text-4 mb-2">{m.admin_logs_raw_payload()}</div>
				<pre class="text-[11.5px] font-mono bg-surface border border-border rounded-lg p-3 overflow-x-auto text-text-2">{JSON.stringify(selected, null, 2)}</pre>
			</div>
		</div>
	{/if}
</Drawer>
