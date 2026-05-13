<script lang="ts">
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Button from '$lib/components/Button.svelte';
	import { ROLE_PERMISSIONS, USER_ROLES } from '$lib/data';

	let collapsed = $state(new Set<string>());
	function toggle(g: string) {
		const n = new Set(collapsed);
		n.has(g) ? n.delete(g) : n.add(g);
		collapsed = n;
	}
</script>

<svelte:head><title>Trackr · Roles & Permissions</title></svelte:head>

<Topbar crumbs={[{ label: 'Trackr Workspace', href: '/tasks' }, { label: 'Roles' }]} />

<div class="flex-1 min-h-0 overflow-y-auto">
	<div class="px-6 py-6 max-w-[1100px]">
		<div class="flex items-end gap-4 mb-6">
			<div>
				<h1 class="text-[26px] font-semibold tracking-[-0.014em]">Roles & Permissions</h1>
				<p class="text-[12.5px] text-text-3 mt-1 max-w-xl leading-relaxed">
					Define what each role can do. Owner is fixed — every permission is always granted.
				</p>
			</div>
			<div class="ml-auto">
				<Button variant="default" size="sm"><Icon name="plus" size={13} /> New role</Button>
			</div>
		</div>

		<div class="bg-bg-elev border border-border rounded-2xl overflow-hidden">
			<div
				class="grid items-center gap-3 px-5 h-10 text-[11px] uppercase tracking-[0.08em] text-text-4 border-b border-border bg-surface/30"
				style:grid-template-columns="2fr 100px 100px 100px 100px"
			>
				<span>Permission</span>
				{#each USER_ROLES as r (r.id)}
					<span class="flex items-center gap-1.5 justify-center" style:color={r.color}>
						{#if r.id === 'owner'}<Icon name="shield" size={11} />{/if}
						{r.label}
					</span>
				{/each}
			</div>
			{#each ROLE_PERMISSIONS as g (g.group)}
				{@const isCollapsed = collapsed.has(g.group)}
				<button
					type="button"
					onclick={() => toggle(g.group)}
					class="flex items-center gap-2 w-full px-5 py-2.5 bg-surface/20 border-y border-border text-left text-[12.5px]"
				>
					<span class="transition-transform text-text-3 {isCollapsed ? '-rotate-90' : ''}">
						<Icon name="chevron" size={11} />
					</span>
					<span class="font-semibold text-text">{g.group}</span>
					<span class="font-mono text-[11px] text-text-3">{g.items.length}</span>
				</button>
				{#if !isCollapsed}
					{#each g.items as item (item.id)}
						<div
							class="grid items-center gap-3 px-5 py-2.5 border-b border-border/40 hover:bg-[var(--row-hover)]"
							style:grid-template-columns="2fr 100px 100px 100px 100px"
						>
							<div class="min-w-0">
								<div class="text-[13px] text-text">{item.label}</div>
								<div class="font-mono text-[10.5px] text-text-4 mt-0.5">{item.id}</div>
							</div>
							{#each USER_ROLES as r (r.id)}
								{@const on = item.perms[r.id]}
								{@const locked = r.id === 'owner'}
								<div class="flex justify-center">
									<button
										type="button"
										disabled={locked}
										class="w-7 h-7 rounded-md grid place-items-center transition-colors {on ? 'text-white' : 'text-text-4 hover:text-text-2 border border-border bg-surface'} {locked ? 'cursor-default' : ''}"
										style:background={on ? r.color : ''}
										style:border-color={on ? 'transparent' : ''}
									>
										{#if on}
											<Icon name="check" size={12} />
										{:else}
											<Icon name="x" size={11} />
										{/if}
									</button>
								</div>
							{/each}
						</div>
					{/each}
				{/if}
			{/each}
		</div>
	</div>
</div>
