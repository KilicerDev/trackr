<script lang="ts">
	import { pageTitle } from '$lib/brand';
	import { page } from '$app/state';
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { m } from '$lib/paraglide/messages';

	let { children }: { children: import('svelte').Snippet } = $props();

	const items = $derived([
		{ href: '/me/profile', label: m.settings_nav_profile(), icon: 'user' as const },
		{ href: '/me/settings', label: m.settings_nav_account(), icon: 'settings' as const },
		{ href: '/me/notifications', label: m.settings_nav_notifications(), icon: 'bell' as const },
		{ href: '/me/instances', label: m.settings_nav_instances(), icon: 'link' as const },
		{ href: '/me/connections', label: m.settings_nav_connections(), icon: 'sparkle' as const }
	]);

	const current = $derived(page.url.pathname);
	const currentLabel = $derived(
		items.find((i) => current.startsWith(i.href))?.label ?? m.settings_nav_account_short()
	);
</script>

<svelte:head><title>{pageTitle(currentLabel)}</title></svelte:head>

<Topbar
	crumbs={[{ label: m.settings_nav_account_short(), href: '/me/profile' }, { label: currentLabel }]}
/>

<div class="min-h-0 flex-1 overflow-y-auto">
	<div class="mx-auto grid max-w-[1056px] grid-cols-[200px_1fr] gap-8 px-6 py-6">
		<aside class="pt-1">
			<nav class="flex flex-col gap-0.5">
				{#each items as item (item.href)}
					{@const active = current.startsWith(item.href)}
					<a
						href={item.href}
						class="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[14px] leading-none transition-colors
							{active ? 'bg-surface-2 font-medium text-text' : 'text-text-2 hover:bg-surface hover:text-text'}"
					>
						<span class="grid h-4 w-4 place-items-center {active ? 'text-text' : 'text-text-3'}">
							<Icon name={item.icon} size={15} />
						</span>
						<span>{item.label}</span>
					</a>
				{/each}
			</nav>
		</aside>
		<div class="min-w-0">
			{@render children()}
		</div>
	</div>
</div>
