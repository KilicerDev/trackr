<script lang="ts">
	import { page } from '$app/state';
	import Icon from '../Icon.svelte';
	import InstanceSwitcher from './InstanceSwitcher.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getSidebar } from '$lib/stores/sidebar.svelte';
	import type { CapabilityManifest } from '$lib/permissions';

	const sidebar = getSidebar();
	const collapsed = $derived(!!sidebar?.collapsed);

	type LayoutShape = {
		taskCount?: number;
		projects?: { id: string; key: string; name: string; color: string }[];
		capabilities?: CapabilityManifest;
	};

	const taskCount = $derived((page.data as LayoutShape).taskCount ?? 0);
	const projectList = $derived((page.data as LayoutShape).projects ?? []);
	// Surface visibility comes from the server-computed capability manifest —
	// the single source shared with the settings page and the mobile app.
	const surfaces = $derived((page.data as LayoutShape).capabilities?.surfaces);
	const isAdmin = $derived(!!surfaces?.admin);
	// Settings is the superadmin tier (admin.settings.manage); the manifest
	// already folds that in, so the sidebar mirrors the server gate exactly.
	const showSettings = $derived(!!surfaces?.settings);
	const showWikiNotes = $derived(!!surfaces?.wiki);
	const canChat = $derived(!!surfaces?.chat);

	const workspaceItems = $derived([
		{ key: 'week', label: m.shell_nav_week(), icon: 'calendar', href: '/week' },
		{
			key: 'tickets',
			label: m.shell_nav_tickets(),
			icon: 'ticket',
			href: '/tickets'
		},
		...(canChat ? [{ key: 'chat', label: m.shell_nav_chat(), icon: 'msg', href: '/chat' }] : []),
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
		...(showWikiNotes
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
		// Directory = users + organizations, opening on users.
		{
			key: 'directory',
			label: m.shell_admin_directory(),
			icon: 'users',
			href: '/admin/directory/users'
		},
		// Project templates: admin-tier content, its own section.
		{
			key: 'templates',
			label: m.shell_admin_templates(),
			icon: 'check-square',
			href: '/admin/templates'
		},
		...(showSettings
			? [
					{
						key: 'settings',
						label: m.shell_admin_system_settings(),
						icon: 'settings',
						href: '/admin/settings'
					}
				]
			: []),
		// System opens on the audit log (every admin, like its roles tab); the
		// jobs + schedules tabs need admin.system.manage and are hidden otherwise.
		{
			key: 'system',
			label: m.shell_admin_system(),
			icon: 'sliders',
			href: '/admin/system/logs'
		}
	]);

	function isActive(href: string): boolean {
		if (href === '/') return page.url.pathname === '/';
		return page.url.pathname.startsWith(href);
	}

	// Labels stay in the DOM and only fade — never pulled from flow — so nothing
	// they sit next to reflows when the rail collapses.
	const fade = $derived(
		`whitespace-nowrap transition-opacity duration-150 ${
			collapsed ? 'pointer-events-none opacity-0' : 'opacity-100'
		}`
	);

	// Seamless collapse: the icon must never move. Its left offset is
	// container-padding + row-margin + row-padding, which we keep at a constant
	// 24px in both states — left-aligned in the 260px rail, dead-centre in the
	// 64px one. Container pad stays 8px, so only the row's own margin/padding
	// interpolate (deltas cancel: −4 +4 = 0) and the icon holds still while the
	// highlight grows, leaving an 8px inset on each side of the collapsed rail.
	const row = $derived(
		`relative my-[1px] flex items-center gap-2.5 rounded-[7px] py-[8px] text-[15px] text-text-2 transition-[margin,padding,background-color,color] duration-150 hover:bg-[var(--row-hover)] hover:text-text ${
			collapsed ? 'mx-0 px-4' : 'mx-1 px-3'
		}`
	);
</script>

<aside class="flex min-h-0 w-full flex-col overflow-hidden border-r border-border bg-bg-elev">
	<InstanceSwitcher {fade} />

	<div class="mt-1.5 flex-1 overflow-x-hidden overflow-y-auto px-2 pb-2">
		<div class="py-1.5">
			{#if collapsed}
				<div class="h-1.5"></div>
			{:else}
				<div
					class="px-3 pt-2.5 pb-1.5 text-[12px] font-medium tracking-[0.08em] text-text-4 uppercase"
				>
					{m.shell_section_workspace()}
				</div>
			{/if}
			{#each workspaceItems as item (item.key)}
				{@const active = isActive(item.href)}
				<a
					href={item.href}
					title={collapsed ? item.label : undefined}
					class="{row} {active ? 'bg-[var(--row-active)] !text-text' : ''}"
				>
					<span
						class="grid h-4 w-4 shrink-0 place-items-center {active
							? 'text-accent'
							: 'text-text-3'}"
					>
						<Icon name={item.icon} size={16} />
					</span>
					<span class={fade}>{item.label}</span>
					{#if item.count !== undefined}
						<span class="ml-auto font-mono text-[12px] text-text-3 {fade}">{item.count}</span>
					{/if}
				</a>
			{/each}
		</div>

		{#if isAdmin}
			<div class="py-1.5">
				{#if collapsed}
					<div class="mx-3 mb-2 border-t border-border"></div>
				{:else}
					<div
						class="px-3 pt-2.5 pb-1.5 text-[12px] font-medium tracking-[0.08em] text-text-4 uppercase"
					>
						{m.shell_section_admin()}
					</div>
				{/if}
				{#each adminItems as item (item.key)}
					{@const active = isActive(item.href)}
					<a
						href={item.href}
						title={collapsed ? item.label : undefined}
						class="{row} {active ? 'bg-[var(--row-active)] !text-text' : ''}"
					>
						<span
							class="grid h-4 w-4 shrink-0 place-items-center {active
								? 'text-accent'
								: 'text-text-3'}"
						>
							<Icon name={item.icon} size={16} />
						</span>
						<span class={fade}>{item.label}</span>
					</a>
				{/each}
			</div>
		{/if}
	</div>
</aside>
