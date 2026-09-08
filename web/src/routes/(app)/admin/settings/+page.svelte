<script lang="ts">
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

<div class="max-w-[902px]">
	<h1 class="mb-1 text-[26px] font-semibold tracking-[-0.014em]">{m.admin_settings_title()}</h1>
	<p class="mb-6 text-[14px] text-text-3">{m.admin_settings_subtitle()}</p>

	<section class="mb-5 rounded-2xl border border-border bg-bg-elev p-5">
		<div class="mb-3 text-[12px] tracking-[0.08em] text-text-4 uppercase">
			{m.admin_workspace()}
		</div>
		<div class="grid grid-cols-[160px_1fr] items-center gap-x-4 gap-y-3 text-[14px]">
			<label for="ws-name" class="text-text-3">{m.admin_name()}</label>
			<input
				id="ws-name"
				bind:value={workspaceName}
				class="rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-border-strong"
			/>
			<div class="text-text-3">{m.admin_settings_owner()}</div>
			<div>{me?.name ?? '—'} <span class="font-mono text-text-3">· {me?.email ?? ''}</span></div>
			<div class="text-text-3">{m.admin_settings_members()}</div>
			<div>
				{memberCount}
				<span class="text-text-3"
					>{m.admin_settings_manage_in()}
					<a href="/admin/directory/users" class="text-accent hover:underline">{m.admin_users_title()}</a
					></span
				>
			</div>
		</div>
	</section>

	<section class="mb-5 rounded-2xl border border-border bg-bg-elev p-5">
		<div class="mb-3 text-[12px] tracking-[0.08em] text-text-4 uppercase">
			{m.admin_settings_integrations()}
		</div>
		<div class="space-y-2">
			{#each integrations as [name, desc] (name)}
				<div class="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
					<span
						class="grid h-8 w-8 place-items-center rounded-md border border-border bg-bg-elev text-text-3"
						><Icon name="link" size={15} /></span
					>
					<div class="min-w-0 flex-1">
						<div class="text-[14px] font-medium">{name}</div>
						<div class="text-[12px] text-text-3">{desc}</div>
					</div>
					<Button size="sm" variant="default">{m.admin_settings_connect()}</Button>
				</div>
			{/each}
		</div>
	</section>

	<section class="rounded-2xl border border-border bg-bg-elev p-5">
		<div class="mb-3 text-[12px] tracking-[0.08em] text-text-4 uppercase">
			{m.admin_settings_danger_zone()}
		</div>
		<div class="flex items-center gap-3 rounded-lg border border-[#ef7a6d]/30 bg-[#ef7a6d]/5 p-3">
			<Icon name="shield" size={17} class="text-[#ef7a6d]" />
			<div class="min-w-0 flex-1">
				<div class="text-[14px] font-medium">{m.admin_settings_delete_workspace()}</div>
				<div class="text-[12px] text-text-3">{m.admin_settings_delete_workspace_desc()}</div>
			</div>
			<Button size="sm">{m.common_delete()}</Button>
		</div>
	</section>
</div>
