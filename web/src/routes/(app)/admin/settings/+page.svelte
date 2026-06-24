<script lang="ts">
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Button from '$lib/components/Button.svelte';
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages';

	type LayoutData = {
		user?: { id: string; name: string; email: string };
		users?: { id: string; status: string }[];
	};
	const me = $derived((page.data as LayoutData).user);
	const memberCount = $derived(((page.data as LayoutData).users ?? []).length);
	let workspaceName = $state('Trackr');

	const integrations = $derived([
		['Slack', m.admin_settings_integration_slack_desc()],
		['GitHub', m.admin_settings_integration_github_desc()],
		['Linear', m.admin_settings_integration_linear_desc()]
	] as [string, string][]);
</script>

<svelte:head><title>{m.admin_settings_page_title()}</title></svelte:head>

<Topbar crumbs={[{ label: m.admin_crumb_workspace(), href: '/tasks' }, { label: m.admin_settings_title() }]} />

<div class="flex-1 min-h-0 overflow-y-auto">
	<div class="px-6 py-6 max-w-[820px]">
		<h1 class="text-[26px] font-semibold tracking-[-0.014em] mb-1">{m.admin_settings_title()}</h1>
		<p class="text-[12.5px] text-text-3 mb-6">{m.admin_settings_subtitle()}</p>

		<section class="bg-bg-elev border border-border rounded-2xl p-5 mb-5">
			<div class="text-[11px] uppercase tracking-[0.08em] text-text-4 mb-3">{m.admin_workspace()}</div>
			<div class="grid grid-cols-[160px_1fr] items-center gap-y-3 gap-x-4 text-[13px]">
				<label for="ws-name" class="text-text-3">{m.admin_name()}</label>
				<input
					id="ws-name"
					bind:value={workspaceName}
					class="bg-surface border border-border rounded-lg px-3 py-2 outline-none focus:border-border-strong"
				/>
				<div class="text-text-3">{m.admin_settings_owner()}</div>
				<div>{me?.name ?? '—'} <span class="text-text-3 font-mono">· {me?.email ?? ''}</span></div>
				<div class="text-text-3">{m.admin_settings_members()}</div>
				<div>{memberCount} <span class="text-text-3">{m.admin_settings_manage_in()} <a href="/admin/users" class="text-accent hover:underline">{m.admin_users_title()}</a></span></div>
			</div>
		</section>

		<section class="bg-bg-elev border border-border rounded-2xl p-5 mb-5">
			<div class="text-[11px] uppercase tracking-[0.08em] text-text-4 mb-3">{m.admin_settings_integrations()}</div>
			<div class="space-y-2">
				{#each integrations as [name, desc] (name)}
					<div class="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface border border-border">
						<span class="w-8 h-8 rounded-md grid place-items-center bg-bg-elev border border-border text-text-3"><Icon name="link" size={14} /></span>
						<div class="flex-1 min-w-0">
							<div class="text-[13px] font-medium">{name}</div>
							<div class="text-[11.5px] text-text-3">{desc}</div>
						</div>
						<Button size="sm" variant="default">{m.admin_settings_connect()}</Button>
					</div>
				{/each}
			</div>
		</section>

		<section class="bg-bg-elev border border-border rounded-2xl p-5">
			<div class="text-[11px] uppercase tracking-[0.08em] text-text-4 mb-3">{m.admin_settings_danger_zone()}</div>
			<div class="flex items-center gap-3 p-3 rounded-lg border border-[#ef7a6d]/30 bg-[#ef7a6d]/5">
				<Icon name="shield" size={16} class="text-[#ef7a6d]" />
				<div class="flex-1 min-w-0">
					<div class="text-[13px] font-medium">{m.admin_settings_delete_workspace()}</div>
					<div class="text-[11.5px] text-text-3">{m.admin_settings_delete_workspace_desc()}</div>
				</div>
				<Button size="sm">{m.common_delete()}</Button>
			</div>
		</section>
	</div>
</div>
