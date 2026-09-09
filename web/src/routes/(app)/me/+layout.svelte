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
	<div
		class="mx-auto grid max-w-[1056px] grid-cols-1 gap-5 px-6 py-6 md:grid-cols-[200px_1fr] md:gap-8"
	>
		<!-- Below md the section nav is a horizontally scrolling row above the content. -->
		<aside class="self-start md:sticky md:top-6 md:pt-1">
			<nav
				class="flex gap-0.5 max-md:-mx-6 max-md:overflow-x-auto max-md:border-b max-md:border-border max-md:px-6 max-md:pb-2 md:flex-col"
			>
				{#each items as item (item.href)}
					{@const active = current.startsWith(item.href)}
					<a
						href={item.href}
						class="flex shrink-0 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[14px] leading-none whitespace-nowrap transition-colors
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
