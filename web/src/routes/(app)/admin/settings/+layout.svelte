<script lang="ts">
	import { brandName } from '$lib/brand';
	import { page } from '$app/state';
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import { m } from '$lib/paraglide/messages';

	let { children } = $props();

	// General lives at the section root, so it matches exactly; every other tab
	// owns a subtree.
	const tabs = [
		{ href: '/admin/settings', label: m.settings_tab_general(), exact: true },
		{ href: '/admin/settings/webhooks', label: m.settings_tab_webhooks(), exact: false },
		{ href: '/admin/settings/api-keys', label: m.settings_tab_api_keys(), exact: false },
		{ href: '/admin/settings/mcp', label: m.settings_tab_mcp(), exact: false },
		{ href: '/admin/settings/devices', label: m.settings_tab_devices(), exact: false },
		{ href: '/admin/settings/templates', label: m.settings_tab_templates(), exact: false }
	];
	const isActive = (t: { href: string; exact: boolean }) =>
		t.exact ? page.url.pathname === t.href : page.url.pathname.startsWith(t.href);
</script>

<Topbar
	crumbs={[
		{ label: m.admin_crumb_workspace({ brand: brandName() }), href: '/tasks' },
		{ label: m.admin_settings_title() }
	]}
/>

<div class="min-h-0 flex-1 overflow-y-auto">
	<div class="px-6 py-6">
		<div class="mb-6 flex items-center gap-1 border-b border-border">
			{#each tabs as t (t.href)}
				<a
					href={t.href}
					class="-mb-px border-b-2 px-3 py-2 text-[14px] transition-colors {isActive(t)
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
