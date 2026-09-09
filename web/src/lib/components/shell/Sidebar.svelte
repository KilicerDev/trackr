<script lang="ts">
	import { page } from '$app/state';
	import Icon from '../Icon.svelte';
	import InstanceSwitcher from './InstanceSwitcher.svelte';
	import RailHeading from './RailHeading.svelte';
	import { Rail } from './rail.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { CapabilityManifest } from '$lib/permissions';

	type LayoutShape = {
		taskCount?: number;
		projects?: { id: string; key: string; name: string; color: string }[];
		capabilities?: CapabilityManifest;
	};
	type NavItem = { key: string; label: string; icon: string; href: string; count?: number };

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

	const workspaceItems = $derived<NavItem[]>([
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

	const adminItems = $derived<NavItem[]>([
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

	// Collapse + hover-peek mechanics live in Rail (shared with the portal).
	const rail = new Rail(260);
</script>

{#snippet nav(item: NavItem)}
	{@const active = isActive(item.href)}
	<a
		href={item.href}
		aria-label={rail.rail ? item.label : undefined}
		class="{rail.row} {active ? 'bg-[var(--row-active)] !text-text' : ''}"
	>
		<span class={rail.icon(active)}>
			<Icon name={item.icon} size={18} />
		</span>
		<span class={rail.fade}>{item.label}</span>
		{#if item.count !== undefined}
			<span class="ml-auto font-mono text-[12px] text-text-3 {rail.fade}">{item.count}</span>
		{/if}
	</a>
{/snippet}

<aside
	onmouseenter={() => rail.setHover(true)}
	onmouseleave={() => rail.setHover(false)}
	onfocusin={rail.focusin}
	onfocusout={rail.focusout}
	class={rail.aside}
	style:width={rail.width}
>
	<InstanceSwitcher fade={rail.fade} bind:open={rail.menuOpen} />

	<nav class="mt-1.5 flex-1 overflow-x-hidden overflow-y-auto px-2 pb-2">
		<div class="py-1.5">
			<RailHeading {rail} label={m.shell_section_workspace()} />
			{#each workspaceItems as item (item.key)}
				{@render nav(item)}
			{/each}
		</div>

		{#if isAdmin}
			<div class="py-1.5">
				<RailHeading {rail} label={m.shell_section_admin()} divider />
				{#each adminItems as item (item.key)}
					{@render nav(item)}
				{/each}
			</div>
		{/if}
	</nav>
</aside>
