<script lang="ts">
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Button from '$lib/components/Button.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Display order is the role row order from the DB (sorted by scope,
	// then sortOrder). Filtering by scope produces the two column sets.
	const orgRoles = $derived(data.roles.filter((r) => r.scope === 'org'));
	const projectRoles = $derived(data.roles.filter((r) => r.scope === 'project'));

	// Union of every permission key seen in the matrix. We group by the
	// leading namespace segment for readability — admin / org / project.
	type PermGroup = { label: string; key: string; perms: string[] };
	const groups = $derived.by<PermGroup[]>(() => {
		const all = new Set<string>();
		for (const list of Object.values(data.permsByRole)) for (const p of list) all.add(p);
		const buckets: Record<string, string[]> = {};
		for (const p of all) {
			const head = p.split('.')[0];
			(buckets[head] ??= []).push(p);
		}
		for (const k of Object.keys(buckets)) buckets[k].sort();
		const LABEL: Record<string, string> = {
			admin: m.admin_roles_group_admin(),
			org: m.admin_roles_group_org(),
			project: m.admin_roles_group_project()
		};
		const ORDER = ['admin', 'org', 'project'];
		return ORDER.filter((k) => buckets[k]).map((k) => ({
			key: k,
			label: LABEL[k] ?? k,
			perms: buckets[k]
		}));
	});

	let collapsed = $state(new Set<string>());
	function toggle(g: string) {
		const n = new Set(collapsed);
		n.has(g) ? n.delete(g) : n.add(g);
		collapsed = n;
	}

	function has(roleId: string, perm: string): boolean {
		return data.permsByRole[roleId]?.includes(perm) ?? false;
	}

	// Tabular columns grouped by scope: internal-only admin roles, regular
	// org roles, then project roles. A 1px divider track separates groups.
	const internalOrgRoles = $derived(orgRoles.filter((r) => r.internalOnly));
	const tenantOrgRoles = $derived(orgRoles.filter((r) => !r.internalOnly));
	const allCols = $derived([...internalOrgRoles, ...tenantOrgRoles, ...projectRoles]);
	const dividerBetweenOrg = $derived(internalOrgRoles.length > 0 && tenantOrgRoles.length > 0);
	const dividerBeforeProject = $derived(orgRoles.length > 0 && projectRoles.length > 0);
	const dividerCount = $derived(
		(dividerBetweenOrg ? 1 : 0) + (dividerBeforeProject ? 1 : 0)
	);
	const gridTemplate = $derived(
		[
			'minmax(260px,1fr)',
			...internalOrgRoles.map(() => '88px'),
			...(dividerBetweenOrg ? ['1px'] : []),
			...tenantOrgRoles.map(() => '88px'),
			...(dividerBeforeProject ? ['1px'] : []),
			...projectRoles.map(() => '88px')
		].join(' ')
	);
	// 20 (px-5) + 260 (perm) + N*(88 + 12 gap) + 20 (px-5) [+ 13 per divider track + gap]
	const minRowWidth = $derived(300 + allCols.length * 100 + dividerCount * 13);
</script>

<svelte:head><title>{m.admin_roles_page_title()}</title></svelte:head>

<Topbar crumbs={[{ label: m.admin_crumb_workspace(), href: '/tasks' }, { label: m.admin_roles_crumb() }]} />

<div class="flex-1 min-h-0 overflow-y-auto">
	<div class="px-6 py-6 max-w-[1280px]">
		<div class="flex items-end gap-4 mb-6">
			<div>
				<h1 class="text-[26px] font-semibold tracking-[-0.014em]">{m.admin_roles_title()}</h1>
				<p class="text-[12.5px] text-text-3 mt-1 max-w-2xl leading-relaxed">
					{m.admin_roles_subtitle()}
				</p>
			</div>
			<div class="ml-auto" title={m.admin_roles_custom_soon()}>
				<Button variant="default" size="sm" disabled>
					<Icon name="plus" size={13} /> {m.admin_roles_new()}
				</Button>
			</div>
		</div>

		<!-- Scope legend -->
		<div class="flex items-center gap-3 mb-3 text-[11.5px] text-text-3">
			<span class="inline-flex items-center gap-1.5">
				<span class="w-1.5 h-1.5 rounded-full bg-accent"></span>
				{m.admin_roles_legend_org({ count: orgRoles.length })}
			</span>
			<span class="inline-flex items-center gap-1.5">
				<span class="w-1.5 h-1.5 rounded-full bg-[#7a9cf0]"></span>
				{m.admin_roles_legend_project({ count: projectRoles.length })}
			</span>
		</div>

		<div class="bg-bg-elev border border-border rounded-2xl overflow-x-auto">
			<div style:min-width="{minRowWidth}px">
			{#snippet headerCell(r: (typeof allCols)[number])}
				<div
					class="flex flex-col items-center gap-0.5 leading-tight normal-case"
					title={r.description ?? ''}
				>
					<span class="flex items-center gap-1.5" style:color={r.color ?? 'inherit'}>
						{#if r.internalOnly}<Icon name="shield" size={11} />{/if}
						<span class="font-semibold text-[12px]">{r.label}</span>
					</span>
					<span class="font-mono text-[10px] text-text-4 lowercase tracking-normal">
						{r.internalOnly ? r.id.replace(/^org\./, '') : r.id}
					</span>
				</div>
			{/snippet}

			{#snippet bodyCell(r: (typeof allCols)[number], p: string)}
				{@const on = has(r.id, p)}
				<div class="flex justify-center">
					<span
						class="w-7 h-7 rounded-md grid place-items-center transition-colors {on
							? 'text-white'
							: 'text-text-4 border border-border bg-surface'}"
						style:background={on ? (r.color ?? 'var(--accent)') : ''}
						style:border-color={on ? 'transparent' : ''}
						aria-label={on ? m.admin_roles_granted() : m.admin_roles_not_granted()}
					>
						{#if on}
							<Icon name="check" size={12} />
						{:else}
							<Icon name="x" size={11} />
						{/if}
					</span>
				</div>
			{/snippet}

			<!-- Header row -->
			<div
				class="grid items-end gap-3 px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-text-4 border-b border-border bg-surface/30"
				style:grid-template-columns={gridTemplate}
			>
				<span>{m.admin_roles_col_permission()}</span>
				{#each internalOrgRoles as r (r.id)}
					{@render headerCell(r)}
				{/each}
				{#if dividerBetweenOrg}
					<div class="self-stretch w-px bg-border" aria-hidden="true"></div>
				{/if}
				{#each tenantOrgRoles as r (r.id)}
					{@render headerCell(r)}
				{/each}
				{#if dividerBeforeProject}
					<div class="self-stretch w-px bg-border" aria-hidden="true"></div>
				{/if}
				{#each projectRoles as r (r.id)}
					{@render headerCell(r)}
				{/each}
			</div>

			{#each groups as g (g.key)}
				{@const isCollapsed = collapsed.has(g.key)}
				<button
					type="button"
					onclick={() => toggle(g.key)}
					class="flex items-center gap-2 w-full px-5 py-2.5 bg-surface/20 border-y border-border text-left text-[12.5px]"
				>
					<span class="transition-transform text-text-3 {isCollapsed ? '-rotate-90' : ''}">
						<Icon name="chevron" size={11} />
					</span>
					<span class="font-semibold text-text">{g.label}</span>
					<span class="font-mono text-[11px] text-text-3">{g.perms.length}</span>
				</button>
				{#if !isCollapsed}
					{#each g.perms as p (p)}
						<div
							class="grid items-center gap-3 px-5 py-2.5 border-b border-border/40 hover:bg-[var(--row-hover)]"
							style:grid-template-columns={gridTemplate}
						>
							<div class="min-w-0">
								<div class="text-[13px] text-text">{p}</div>
							</div>
							{#each internalOrgRoles as r (r.id)}
								{@render bodyCell(r, p)}
							{/each}
							{#if dividerBetweenOrg}
								<div class="self-stretch w-px bg-border" aria-hidden="true"></div>
							{/if}
							{#each tenantOrgRoles as r (r.id)}
								{@render bodyCell(r, p)}
							{/each}
							{#if dividerBeforeProject}
								<div class="self-stretch w-px bg-border" aria-hidden="true"></div>
							{/if}
							{#each projectRoles as r (r.id)}
								{@render bodyCell(r, p)}
							{/each}
						</div>
					{/each}
				{/if}
			{/each}
			</div>
		</div>

		<p class="mt-4 text-[11.5px] text-text-4 max-w-2xl">
			{m.admin_roles_internal_note_before()}<Icon name="shield" size={11} />{m.admin_roles_internal_note_after()}
		</p>
	</div>
</div>
