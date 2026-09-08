<script lang="ts">
	import { brandName } from '$lib/brand';
	import { page } from '$app/state';
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import { m } from '$lib/paraglide/messages';

	let { children } = $props();

	// Logs (the section's home) and Roles are open to every admin; the job
	// queue and schedules stay root-tier (the server gate mirrors this split).
	const isSuperadmin = $derived(!!(page.data as { isSuperadmin?: boolean }).isSuperadmin);
	const tabs = $derived([
		{ href: '/admin/system/logs', label: m.system_tab_logs() },
		{ href: '/admin/system/roles', label: m.system_tab_roles() },
		...(isSuperadmin
			? [
					{ href: '/admin/system/jobs', label: m.system_tab_jobs() },
					{ href: '/admin/system/schedules', label: m.system_tab_schedules() }
				]
			: [])
	]);
	const isActive = (href: string) => page.url.pathname.startsWith(href);
</script>

<Topbar
	crumbs={[
		{ label: m.admin_crumb_workspace({ brand: brandName() }), href: '/tasks' },
		{ label: m.system_title() }
	]}
/>

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
