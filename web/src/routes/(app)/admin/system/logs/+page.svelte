<script lang="ts">
	import { pageTitle } from '$lib/brand';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ViewPanel from '$lib/components/view-panel/ViewPanel.svelte';
	import PanelSection from '$lib/components/view-panel/PanelSection.svelte';
	import SelectRow from '$lib/components/view-panel/SelectRow.svelte';
	import FilterSection, { type FilterField } from '$lib/components/view-panel/FilterSection.svelte';
	import FilterTrigger from '$lib/components/view-panel/FilterTrigger.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Button from '$lib/components/Button.svelte';
	import IconButton from '$lib/components/IconButton.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import { LOG_EVENT_TYPES, LOG_KINDS } from '$lib/config/taxonomy';
	import { m } from '$lib/paraglide/messages';
	import { logKindLabel, logEventLabel } from '$lib/utils/labels';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	type Row = PageData['events'][number];

	// Filter state, seeded from the loaded query and re-synced whenever a new page
	// loads (filter change / navigation). Changing kind/range/search navigates,
	// which re-runs the server load.
	// Multi-value filters (category, channel, actor) live in one record so the
	// shared FilterSection can drive them; range is a single select.
	let filters = $state<Record<string, string[]>>(filtersFrom(data.filters));
	let range = $state(data.filters.range);
	let search = $state(data.filters.q);
	let panelOpen = $state(false);

	function filtersFrom(f: PageData['filters']): Record<string, string[]> {
		const out: Record<string, string[]> = {};
		if (f.kind.length) out.kind = f.kind;
		if (f.channel.length) out.channel = f.channel;
		if (f.actor.length) out.actor = f.actor;
		return out;
	}

	// Appended pages from "Load more" (the first page comes from `data`).
	let appended = $state<Row[]>([]);
	let extraActors = $state<Record<string, PageData['actors'][string]>>({});
	let cursor = $state<string | null>(data.nextCursor);
	let more = $state(data.hasMore);
	let loading = $state(false);
	let selected = $state<Row | null>(null);

	$effect(() => {
		// Re-sync to the freshly loaded page (depends on the new data identity).
		filters = filtersFrom(data.filters);
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
		for (const key of ['kind', 'channel', 'actor'] as const) {
			const values = filters[key] ?? [];
			if (values.length) parts.push(`${key}=${encodeURIComponent(values.join(','))}`);
		}
		if (range !== '30') parts.push(`range=${encodeURIComponent(range)}`);
		if (search.trim()) parts.push(`q=${encodeURIComponent(search.trim())}`);
		if (extra)
			for (const [k, v] of Object.entries(extra)) parts.push(`${k}=${encodeURIComponent(v)}`);
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
			const res = await fetch(`/admin/system/logs/data?${queryString({ before: cursor })}`);
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

	const exportHref = $derived(`/admin/system/logs/export?${queryString()}`);

	// Surface the action came through (audit_log.channel). Older rows may have
	// none; those show a dash.
	const CHANNELS = ['web', 'app', 'api', 'mcp'] as const;
	const CHANNEL_STYLE: Record<string, string> = {
		web: 'border-border text-text-3',
		app: 'border-[#7a9cf0]/40 text-[#7a9cf0]',
		api: 'border-[#e9c46a]/40 text-[#e9c46a]',
		mcp: 'border-[#c08bd6]/40 text-[#c08bd6]'
	};
	function channelLabel(c: string | null): string {
		switch (c) {
			case 'web':
				return m.admin_logs_channel_web();
			case 'app':
				return m.admin_logs_channel_app();
			case 'api':
				return m.admin_logs_channel_api();
			case 'mcp':
				return m.admin_logs_channel_mcp();
			default:
				return m.admin_logs_channel_unknown();
		}
	}

	// ── Side panel (same components as the tasks / tickets toolbars) ──────────
	type LayoutUser = { id: string; name: string; initials: string; color: string };
	const users = $derived(((page.data as { users?: LayoutUser[] }).users ?? []) as LayoutUser[]);

	const RANGES = $derived([
		{ id: '1', label: m.admin_logs_range_24h() },
		{ id: '7', label: m.admin_logs_range_7days() },
		{ id: '30', label: m.admin_logs_range_30days() },
		{ id: 'all', label: m.admin_logs_range_all_time() }
	]);
	const FIELDS = $derived<FilterField[]>([
		{ id: 'kind', label: m.admin_logs_category(), icon: 'logs' },
		{ id: 'channel', label: m.admin_logs_col_channel(), icon: 'link' },
		{ id: 'actor', label: m.admin_logs_col_actor(), icon: 'users', searchable: true }
	]);
	const activeFilterCount = $derived(
		Object.values(filters).reduce((n, v) => n + (v?.length ?? 0), 0) + (range !== '30' ? 1 : 0)
	);
	const hit = (label: string, query: string) => !query || label.toLowerCase().includes(query);

	function setFilters(next: Record<string, string[]>) {
		filters = next;
		navigate();
	}
	function toggleValue(field: string, value: string) {
		const cur = filters[field] ?? [];
		const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
		const merged = { ...filters, [field]: next };
		if (next.length === 0) delete merged[field];
		setFilters(merged);
	}
	function valueLabel(field: string, v: string): string {
		if (field === 'kind') return logKindLabel(v);
		if (field === 'channel') return channelLabel(v);
		if (field === 'actor') return users.find((u) => u.id === v)?.name ?? v;
		return v;
	}
</script>

{#snippet valuesList(field: string, query: string)}
	{@const values = filters[field] ?? []}
	{#if field === 'kind'}
		{#each LOG_KINDS.filter((k) => k.id !== 'all' && hit(logKindLabel(k.id), query)) as k (k.id)}
			<button
				type="button"
				onclick={() => toggleValue('kind', k.id)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<span class="text-[14px]">{logKindLabel(k.id)}</span>
				<span class="ml-auto text-accent {values.includes(k.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={14} />
				</span>
			</button>
		{/each}
	{:else if field === 'channel'}
		{#each CHANNELS.filter((c) => hit(channelLabel(c), query)) as c (c)}
			<button
				type="button"
				onclick={() => toggleValue('channel', c)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<span
					class="inline-flex h-[20px] items-center rounded-md border px-1.5 font-mono text-[11px] uppercase {CHANNEL_STYLE[
						c
					]}">{channelLabel(c)}</span
				>
				<span class="ml-auto text-accent {values.includes(c) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={14} />
				</span>
			</button>
		{/each}
	{:else if field === 'actor'}
		{#each users.filter((u) => hit(u.name, query)) as u (u.id)}
			<button
				type="button"
				onclick={() => toggleValue('actor', u.id)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<Avatar user={u} size={20} />
				<span class="truncate text-[14px]">{u.name}</span>
				<span class="ml-auto text-accent {values.includes(u.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={14} />
				</span>
			</button>
		{/each}
	{/if}
{/snippet}

<svelte:head
	><title>{pageTitle(`${m.admin_logs_title()} · ${m.system_title()}`)}</title></svelte:head
>

<!-- Chrome (Topbar, scroll container, tabs) comes from the System layout. -->
<div class="mb-6 flex items-end gap-4">
	<div>
		<h1 class="text-[26px] font-semibold tracking-[-0.014em]">{m.admin_logs_title()}</h1>
		<p class="mt-1 max-w-xl text-[14px] text-text-3">
			{m.admin_logs_subtitle()}
		</p>
	</div>
	<div class="ml-auto">
		<Button variant="default" size="sm" onclick={() => (window.location.href = exportHref)}>
			<Icon name="logs" size={14} />
			{m.admin_logs_export_csv()}
		</Button>
	</div>
</div>

<div class="mb-4 flex flex-wrap items-center gap-2.5">
	<FilterTrigger
		open={panelOpen}
		count={activeFilterCount}
		onclick={() => (panelOpen = !panelOpen)}
	/>
	<div class="relative ml-auto">
		<span class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-3">
			<Icon name="search" size={14} />
		</span>
		<input
			type="text"
			bind:value={search}
			oninput={onSearchInput}
			placeholder={m.admin_logs_search_placeholder()}
			class="h-8 w-56 rounded-lg border border-border bg-surface pr-3 pl-8 text-[14px] outline-none focus:border-border-strong"
		/>
	</div>
</div>

<div class="overflow-x-auto rounded-2xl border border-border bg-bg-elev">
	{#if rows.length === 0}
		<EmptyState icon="logs" title={m.admin_logs_empty_title()} />
	{:else}
		<div
			class="grid h-9 min-w-[880px] items-center gap-3 border-b border-border px-5 text-[12px] tracking-[0.08em] text-text-4 uppercase"
			style:grid-template-columns="1.6fr 1fr 2fr 0.7fr 1.4fr 1.2fr 30px"
		>
			<span>{m.admin_logs_col_event()}</span>
			<span>{m.admin_logs_col_actor()}</span>
			<span>{m.admin_logs_col_target()}</span>
			<span>{m.admin_logs_col_channel()}</span>
			<span>{m.admin_logs_col_ip_device()}</span>
			<span>{m.admin_logs_col_when()}</span>
			<span></span>
		</div>
		{#each rows as e (e.id)}
			{@const meta = LOG_EVENT_TYPES[e.type] ?? {
				icon: 'logs',
				color: '#9aa4b2',
				kind: 'settings',
				label: e.type
			}}
			{@const actor = e.actor ? actors[e.actor] : undefined}
			<button
				type="button"
				onclick={() => (selected = e)}
				class="group grid w-full min-w-[880px] items-center gap-3 border-b border-border/40 px-5 py-2.5 text-left text-[14px] transition-colors last:border-b-0 hover:bg-[var(--row-hover)]"
				style:grid-template-columns="1.6fr 1fr 2fr 0.7fr 1.4fr 1.2fr 30px"
			>
				<span class="flex min-w-0 items-center gap-2">
					<span
						class="grid h-6 w-6 shrink-0 place-items-center rounded-md"
						style:background={meta.color + '24'}
						style:color={meta.color}
					>
						<Icon name={meta.icon} size={14} />
					</span>
					<span class="truncate text-text">{logEventLabel(e.type)}</span>
				</span>
				<span class="flex min-w-0 items-center gap-1.5">
					{#if actor}
						<Avatar user={actor} size={20} />
						<span class="truncate">{actor.name.split(' ')[0]}</span>
					{:else}
						<span
							class="grid h-[20px] w-[20px] place-items-center rounded-full bg-surface-2 text-[11px] text-text-3"
							>?</span
						>
						<span class="truncate text-text-3">{e.actorLabel ?? m.admin_logs_anon()}</span>
					{/if}
				</span>
				<span class="truncate text-text-2">{e.target}</span>
				<span class="min-w-0">
					{#if e.channel}
						<span
							class="inline-flex h-[20px] items-center rounded-md border px-1.5 font-mono text-[11px] uppercase {CHANNEL_STYLE[
								e.channel
							] ?? 'border-border text-text-3'}">{channelLabel(e.channel)}</span
						>
					{:else}
						<span class="text-text-4">{m.admin_logs_channel_unknown()}</span>
					{/if}
				</span>
				<span class="min-w-0 text-text-3">
					<span class="font-mono">{e.ip}</span>
					<span class="block truncate text-[12px] text-text-4">{e.device}</span>
				</span>
				<span class="font-mono text-text-3">{e.at}</span>
				<span class="text-text-3 opacity-0 group-hover:opacity-100"
					><Icon name="chevron-r" size={12} /></span
				>
			</button>
		{/each}
		{#if more}
			<div class="flex justify-center border-t border-border px-5 py-3">
				<Button variant="default" size="sm" onclick={loadMore} disabled={loading}>
					{loading ? m.common_loading() : m.admin_logs_load_more()}
				</Button>
			</div>
		{/if}
	{/if}
</div>

<Drawer open={!!selected} onclose={() => (selected = null)} width={420}>
	{#if selected}
		{@const meta = LOG_EVENT_TYPES[selected.type] ?? {
			icon: 'logs',
			color: '#9aa4b2',
			kind: 'settings',
			label: selected.type
		}}
		{@const actor = selected.actor ? actors[selected.actor] : undefined}
		<div class="flex items-center gap-2 border-b border-border px-5 pt-4 pb-3">
			<span class="font-mono text-[12px] tracking-[0.08em] text-text-4 uppercase"
				>{m.admin_logs_event_label({ id: selected.id.slice(0, 8).toUpperCase() })}</span
			>
			<div class="ml-auto">
				<IconButton size={31} ariaLabel={m.common_close()} onclick={() => (selected = null)}
					><Icon name="x" size={15} /></IconButton
				>
			</div>
		</div>
		<div class="flex-1 overflow-y-auto px-5 py-5">
			<div class="mb-5 flex items-center gap-3">
				<span
					class="grid h-12 w-12 shrink-0 place-items-center rounded-xl"
					style:background={meta.color + '24'}
					style:color={meta.color}
				>
					<Icon name={meta.icon} size={22} />
				</span>
				<div class="min-w-0">
					<div class="text-[17px] font-semibold text-text">{logEventLabel(selected.type)}</div>
					<div class="font-mono text-[12px] text-text-3">{selected.type}</div>
				</div>
			</div>

			<div class="mb-6 grid grid-cols-[100px_1fr] gap-x-3 gap-y-3 text-[14px]">
				<div class="text-text-4">{m.admin_logs_col_actor()}</div>
				<div class="flex items-center gap-1.5">
					{#if actor}<Avatar user={actor} size={17} /><span>{actor.name}</span>{:else}<span
							class="text-text-3">{selected.actorLabel ?? m.admin_logs_anonymous()}</span
						>{/if}
				</div>
				<div class="text-text-4">{m.admin_logs_col_target()}</div>
				<div class="break-all text-text">{selected.target || '—'}</div>
				<div class="text-text-4">{m.admin_logs_timestamp()}</div>
				<div class="font-mono text-text">{selected.at}</div>
				<div class="text-text-4">{m.admin_logs_col_channel()}</div>
				<div class="font-mono uppercase">{channelLabel(selected.channel)}</div>
				<div class="text-text-4">{m.admin_logs_ip()}</div>
				<div class="font-mono">{selected.ip}</div>
				<div class="text-text-4">{m.admin_logs_device()}</div>
				<div>{selected.device}</div>
				<div class="text-text-4">{m.admin_logs_category()}</div>
				<div class="capitalize" style:color={meta.color}>{logKindLabel(meta.kind)}</div>
			</div>

			<div>
				<div class="mb-2 text-[12px] tracking-[0.08em] text-text-4 uppercase">
					{m.admin_logs_raw_payload()}
				</div>
				<pre
					class="overflow-x-auto rounded-lg border border-border bg-surface p-3 font-mono text-[12px] text-text-2">{JSON.stringify(
						selected,
						null,
						2
					)}</pre>
			</div>
		</div>
	{/if}
</Drawer>

<ViewPanel
	open={panelOpen}
	onclose={() => (panelOpen = false)}
	title={m.view_options_title()}
	count={activeFilterCount}
>
	<PanelSection title={m.view_layout()}>
		<div class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
			<SelectRow
				label={m.admin_logs_range()}
				options={RANGES}
				value={range}
				onchange={(r) => {
					range = r;
					navigate();
				}}
			/>
		</div>
	</PanelSection>

	<FilterSection fields={FIELDS} {filters} {setFilters} {valueLabel} {valuesList} />
</ViewPanel>
