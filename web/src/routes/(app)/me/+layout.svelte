<script lang="ts">
	import { page } from '$app/state';
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { m } from '$lib/paraglide/messages';

	let { children }: { children: import('svelte').Snippet } = $props();

	const items = $derived([
		{ href: '/me/profile', label: m.settings_nav_profile(), icon: 'user' as const },
		{ href: '/me/settings', label: m.settings_nav_account(), icon: 'settings' as const },
		{ href: '/me/notifications', label: m.settings_nav_notifications(), icon: 'bell' as const }
	]);

	const current = $derived(page.url.pathname);
	const currentLabel = $derived(
		items.find((i) => current.startsWith(i.href))?.label ?? m.settings_nav_account_short()
	);
</script>

<svelte:head><title>Trackr · {currentLabel}</title></svelte:head>

<Topbar crumbs={[{ label: m.settings_nav_account_short(), href: '/me/profile' }, { label: currentLabel }]} />

<div class="flex-1 min-h-0 overflow-y-auto">
	<div class="px-6 py-6 mx-auto max-w-[960px] grid grid-cols-[200px_1fr] gap-8">
		<aside class="pt-1">
			<nav class="flex flex-col gap-0.5">
				{#each items as item (item.href)}
					{@const active = current.startsWith(item.href)}
					<a
						href={item.href}
						class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] leading-none transition-colors
							{active
							? 'bg-surface-2 text-text font-medium'
							: 'text-text-2 hover:text-text hover:bg-surface'}"
					>
						<span class="grid place-items-center w-4 h-4 {active ? 'text-text' : 'text-text-3'}">
							<Icon name={item.icon} size={14} />
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
