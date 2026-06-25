<script lang="ts">
	import { page } from '$app/state';
	import Icon from '../Icon.svelte';
	import Kbd from '../Kbd.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getSidebar } from '$lib/stores/sidebar.svelte';

	const sidebar = getSidebar();
	const collapsed = $derived(!!sidebar?.collapsed);

	type LayoutShape = {
		taskCount?: number;
		projects?: { id: string; key: string; name: string; color: string }[];
		favoriteProjectIds?: string[];
		isAdmin?: boolean;
		isSuperadmin?: boolean;
		isTrackrTeam?: boolean;
		effectivePermissions?: string[];
	};

	const taskCount = $derived((page.data as LayoutShape).taskCount ?? 0);
	const projectList = $derived((page.data as LayoutShape).projects ?? []);
	const favoriteIds = $derived(new Set((page.data as LayoutShape).favoriteProjectIds ?? []));
	const favorites = $derived(projectList.filter((p) => favoriteIds.has(p.id)));
	const isAdmin = $derived(!!(page.data as LayoutShape).isAdmin);
	const isSuperadmin = $derived(!!(page.data as LayoutShape).isSuperadmin);
	const isTrackrTeam = $derived(!!(page.data as LayoutShape).isTrackrTeam);
	const canChat = $derived(
		((page.data as LayoutShape).effectivePermissions ?? []).includes('org.chat.read')
	);

	const workspaceItems = $derived([
		{ key: 'week', label: m.shell_nav_week(), icon: 'calendar', href: '/week' },
		{
			key: 'tickets',
			label: m.shell_nav_tickets(),
			icon: 'ticket',
			href: '/tickets'
		},
		...(canChat
			? [{ key: 'chat', label: m.shell_nav_chat(), icon: 'msg', href: '/chat' }]
			: []),
		{
			key: 'projects',
			label: m.shell_nav_projects(),
			icon: 'folder',
			href: '/projects',
			count: projectList.length
		},
		{
			key: 'tasks',
			label: m.shell_nav_tasks(),
			icon: 'check-square',
			href: '/tasks',
			count: taskCount
		},
		// Wiki + Notes are internal-only — hidden from client / external-org users.
		...(isTrackrTeam
			? [
					{ key: 'wiki', label: m.shell_nav_wiki(), icon: 'book', href: '/wiki' },
					{
						key: 'notes',
						label: m.shell_nav_notes(),
						icon: 'file',
						href: '/notes'
					}
				]
			: [])
	]);

	const adminItems = $derived([
		{
			key: 'orgs',
			label: m.shell_admin_organizations(),
			icon: 'org',
			href: '/admin/organizations'
		},
		{ key: 'roles', label: m.shell_admin_roles(), icon: 'shield', href: '/admin/roles' },
		{
			key: 'users',
			label: m.shell_admin_user_management(),
			icon: 'users',
			href: '/admin/users'
		},
		{
			key: 'settings',
			label: m.shell_admin_system_settings(),
			icon: 'settings',
			href: '/admin/settings'
		},
		{ key: 'logs', label: m.shell_admin_logs(), icon: 'logs', href: '/admin/logs' },
		// System (jobs + schedules) is root-tier only — superadmins, not admins.
		...(isSuperadmin
			? [
					{
						key: 'system',
						label: m.shell_admin_system(),
						icon: 'sliders',
						href: '/admin/system/jobs'
					}
				]
			: [])
	]);

	function isActive(href: string): boolean {
		if (href === '/') return page.url.pathname === '/';
		return page.url.pathname.startsWith(href);
	}

	// Labels stay in the DOM and only fade out — keeping every row/box at its
	// full height so nothing resizes or shifts when the rail collapses.
	const fade = $derived(
		`whitespace-nowrap transition-opacity duration-150 ${collapsed ? 'opacity-0' : 'opacity-100'}`
	);
</script>

<aside class="flex min-h-0 w-full flex-col overflow-hidden border-r border-border bg-bg-elev">
	<div
		class="flex items-center gap-2.5 px-[18px] pt-[18px] pb-[14px] text-[14px] font-semibold tracking-[-0.01em]"
	>
		<span class="grid h-6 w-6 shrink-0 place-items-center" aria-hidden="true">
			<svg
				width="22"
				height="22"
				viewBox="0 0 16 16"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
			>
				<rect x="1.26971" y="1.2627" width="3.65721" height="13.4566" rx="1" fill="#FF4867" />
				<rect x="6.146" y="1.2627" width="3.65721" height="13.4566" rx="1" fill="#FF4867" />
				<rect x="11.0223" y="1.2627" width="3.65721" height="13.4566" rx="1" fill="#FF4867" />
			</svg>
		</span>
		<span class={fade}>Trackr</span>
		<span class="ml-auto font-mono text-[11px] font-normal text-text-3 {fade}">v2</span>
	</div>

	<button
		type="button"
		onclick={() => window.dispatchEvent(new CustomEvent('trackr:open-palette'))}
		title={collapsed ? m.shell_search_placeholder() : undefined}
		class="mx-3 mt-1 mb-3.5 flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2 text-[14px] text-text-3 transition-colors hover:text-text-2"
	>
		<Icon name="search" size={14} class="shrink-0" />
		<span class={fade}>{m.shell_search_placeholder()}</span>
		<span class="ml-auto {fade}"><Kbd>⌘K</Kbd></span>
	</button>

	<div class="flex-1 overflow-x-hidden overflow-y-auto px-2 pb-2">
		<div class="py-1.5">
			<div
				class="px-3 pt-2.5 pb-1.5 text-[11px] font-medium tracking-[0.08em] text-text-4 uppercase {fade}"
			>
				{m.shell_section_workspace()}
			</div>
			{#each workspaceItems as item (item.key)}
				{@const active = isActive(item.href)}
				<a
					href={item.href}
					title={collapsed ? item.label : undefined}
					class="mx-1 my-[1px] flex items-center gap-2.5 rounded-[7px] px-3 py-[7px] text-[14px] text-text-2 transition-colors hover:bg-[var(--row-hover)] hover:text-text
						{active ? 'bg-[var(--row-active)] !text-text' : ''}"
				>
					<span
						class="grid h-4 w-4 shrink-0 place-items-center {active
							? 'text-accent'
							: 'text-text-3'}"
					>
						<Icon name={item.icon} size={15} />
					</span>
					<span class={fade}>{item.label}</span>
					{#if item.count !== undefined}
						<span class="ml-auto font-mono text-[11px] text-text-3 {fade}">{item.count}</span>
					{/if}
				</a>
			{/each}
		</div>

		<div class="py-1.5">
			<div
				class="px-3 pt-2.5 pb-1.5 text-[11px] font-medium tracking-[0.08em] text-text-4 uppercase {fade}"
			>
				{m.shell_section_favorites()}
			</div>
			{#each favorites as p (p.id)}
				<a
					href="/projects/{p.id}"
					title={collapsed ? p.name : undefined}
					class="mx-1 my-[1px] flex items-center gap-2.5 rounded-[7px] px-3 py-[7px] text-[14px] text-text-2 transition-colors hover:bg-[var(--row-hover)] hover:text-text"
				>
					<span class="h-2 w-2 shrink-0 rounded-[2.5px]" style:background={p.color}></span>
					<span class="truncate {fade}">{p.name}</span>
				</a>
			{/each}
			{#if favorites.length === 0}
				<div class="px-3 py-1.5 text-[12px] leading-snug text-text-4 {fade}">
					{m.shell_favorites_empty()}
				</div>
			{/if}
		</div>

		{#if isAdmin}
			<div class="py-1.5">
				<div
					class="px-3 pt-2.5 pb-1.5 text-[11px] font-medium tracking-[0.08em] text-text-4 uppercase {fade}"
				>
					{m.shell_section_admin()}
				</div>
				{#each adminItems as item (item.key)}
					{@const active = isActive(item.href)}
					<a
						href={item.href}
						title={collapsed ? item.label : undefined}
						class="mx-1 my-[1px] flex items-center gap-2.5 rounded-[7px] px-3 py-[7px] text-[14px] text-text-2 transition-colors hover:bg-[var(--row-hover)] hover:text-text
						{active ? 'bg-[var(--row-active)] !text-text' : ''}"
					>
						<span
							class="grid h-4 w-4 shrink-0 place-items-center {active
								? 'text-accent'
								: 'text-text-3'}"
						>
							<Icon name={item.icon} size={15} />
						</span>
						<span class={fade}>{item.label}</span>
					</a>
				{/each}
			</div>
		{/if}
	</div>
</aside>
