<script lang="ts">
	import { page } from '$app/state';
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import { m } from '$lib/paraglide/messages';

	let { children } = $props();

	// Users and organizations are two views of the same directory: who is in
	// the system and how they are grouped. Same tab chrome as /admin/system.
	const tabs = [
		{ href: '/admin/directory/users', label: m.directory_tab_users() },
		{ href: '/admin/directory/organizations', label: m.directory_tab_organizations() }
	];
	const isActive = (href: string) => page.url.pathname.startsWith(href);

	// The organization detail page returns `org`; extend the trail with it so
	// the crumbs still name the record being edited.
	const detailOrg = $derived((page.data as { org?: { name?: string } }).org);
	const crumbs = $derived([
		{ label: m.admin_crumb_workspace(), href: '/tasks' },
		...(detailOrg?.name
			? [
					{ label: m.directory_title(), href: '/admin/directory/users' },
					{ label: m.directory_tab_organizations(), href: '/admin/directory/organizations' },
					{ label: detailOrg.name }
				]
			: [{ label: m.directory_title() }])
	]);
</script>

<Topbar {crumbs} />

<div class="min-h-0 flex-1 overflow-y-auto">
	<div class="px-6 py-6">
		<div class="mb-6 flex items-center gap-1 border-b border-border">
			{#each tabs as t (t.href)}
				<a
					href={t.href}
					class="-mb-px border-b-2 px-3 py-2 text-[14px] transition-colors {isActive(t.href)
						? 'border-accent text-text'
						: 'border-transparent text-text-3 hover:text-text'}"
				>
					{t.label}
				</a>
			{/each}
		</div>
		{@render children?.()}
	</div>
</div>
