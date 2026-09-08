<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import type { ActionResult } from '@sveltejs/kit';
	import Icon from '$lib/components/Icon.svelte';
	import Button from '$lib/components/Button.svelte';
	import BrandLogo from '$lib/components/BrandLogo.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import { brandName } from '$lib/brand';
	import { m } from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type LayoutData = {
		user?: { id: string; name: string; email: string };
		users?: { id: string; status: string }[];
	};
	const me = $derived((page.data as LayoutData).user);
	const memberCount = $derived(((page.data as LayoutData).users ?? []).length);

	// Branding form. `name` is a writable derived: prefilled from the server,
	// editable, and re-synced after a save reloads the data. The logo is a
	// hidden file input previewed locally until saved.
	let name = $derived(data.branding.name);
	let fileInput = $state<HTMLInputElement | null>(null);
	let pending = $state<File | null>(null);
	let preview = $state<string | null>(null);
	let saving = $state(false);
	let formError = $state<string | null>(null);

	function onPick(e: Event) {
		const f = (e.currentTarget as HTMLInputElement).files?.[0] ?? null;
		if (preview) URL.revokeObjectURL(preview);
		pending = f;
		preview = f ? URL.createObjectURL(f) : null;
		formError = null;
	}

	function clearPending() {
		if (preview) URL.revokeObjectURL(preview);
		pending = null;
		preview = null;
		if (fileInput) fileInput.value = '';
	}

	function onSubmit() {
		saving = true;
		formError = null;
		return async ({ result }: { result: ActionResult }) => {
			saving = false;
			if (result.type === 'success') {
				clearPending();
				showToast('ok', m.admin_branding_saved());
				await invalidateAll();
			} else if (result.type === 'failure') {
				formError =
					(result.data as { message?: string } | undefined)?.message ??
					m.admin_branding_err_save_failed();
			} else if (result.type === 'error') {
				formError = m.admin_branding_err_save_failed();
			}
		};
	}

	const integrations = $derived([
		['Slack', m.admin_settings_integration_slack_desc()],
		['GitHub', m.admin_settings_integration_github_desc()],
		['Linear', m.admin_settings_integration_linear_desc()]
	] as [string, string][]);
</script>

<svelte:head><title>{m.admin_settings_page_title({ brand: brandName() })}</title></svelte:head>

<div class="max-w-[902px]">
	<h1 class="mb-1 text-[26px] font-semibold tracking-[-0.014em]">{m.admin_settings_title()}</h1>
	<p class="mb-6 text-[14px] text-text-3">{m.admin_settings_subtitle()}</p>

	<section class="mb-5 rounded-2xl border border-border bg-bg-elev p-5">
		<div class="mb-3 text-[12px] tracking-[0.08em] text-text-4 uppercase">
			{m.admin_workspace()}
		</div>
		<form
			method="post"
			action="?/saveBranding"
			enctype="multipart/form-data"
			use:enhance={onSubmit}
			class="grid grid-cols-[160px_1fr] items-start gap-x-4 gap-y-3 text-[14px]"
		>
			<label for="ws-name" class="pt-2 text-text-3">{m.admin_name()}</label>
			<div>
				<input
					id="ws-name"
					name="name"
					bind:value={name}
					maxlength={data.brandingForm.nameMax}
					placeholder={data.brandingForm.defaultName}
					autocomplete="off"
					class="w-full max-w-[360px] rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-border-strong"
				/>
				<p class="mt-1.5 text-[12px] text-text-4">
					{m.admin_branding_name_hint({ default: data.brandingForm.defaultName })}
				</p>
			</div>

			<div class="pt-2 text-text-3">{m.admin_branding_logo()}</div>
			<div>
				<div class="flex flex-wrap items-center gap-3">
					<span
						class="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface"
					>
						{#if preview}
							<img src={preview} alt="" class="h-8 w-8 object-contain" />
						{:else}
							<BrandLogo size={28} />
						{/if}
					</span>
					<button
						type="button"
						onclick={() => fileInput?.click()}
						class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text-2 transition-colors hover:text-text"
					>
						<Icon name="upload" size={13} />
						{m.admin_branding_choose_logo()}
					</button>
					{#if pending}
						<span class="inline-flex items-center gap-1 text-[13px] text-text-3">
							{m.admin_branding_logo_pending({ name: pending.name })}
							<button
								type="button"
								onclick={clearPending}
								class="grid h-5 w-5 place-items-center rounded text-text-4 hover:text-text"
								aria-label={m.common_cancel()}><Icon name="x" size={12} /></button
							>
						</span>
					{:else if data.branding.logoUrl}
						<button
							type="submit"
							formaction="?/removeLogo"
							formnovalidate
							class="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] text-text-3 transition-colors hover:text-[#ef4f5e]"
						>
							<Icon name="trash" size={13} />
							{m.admin_branding_logo_remove()}
						</button>
					{:else}
						<span class="text-[13px] text-text-4">{m.admin_branding_stock_logo()}</span>
					{/if}
				</div>
				<p class="mt-1.5 text-[12px] text-text-4">
					{m.admin_branding_logo_hint({ max: data.brandingForm.logoMaxKb })}
				</p>
				<input
					bind:this={fileInput}
					name="logo"
					type="file"
					accept={data.brandingForm.accept}
					class="hidden"
					onchange={onPick}
				/>
			</div>

			<div></div>
			<div class="flex items-center gap-3">
				<Button type="submit" variant="primary" disabled={saving}>{m.common_save()}</Button>
				{#if formError}
					<span class="text-[13px] text-[#ef4f5e]">{formError}</span>
				{/if}
			</div>
		</form>

		<div
			class="mt-4 grid grid-cols-[160px_1fr] items-center gap-x-4 gap-y-3 border-t border-border pt-4 text-[14px]"
		>
			<div class="text-text-3">{m.admin_settings_owner()}</div>
			<div>{me?.name ?? '—'} <span class="font-mono text-text-3">· {me?.email ?? ''}</span></div>
			<div class="text-text-3">{m.admin_settings_members()}</div>
			<div>
				{memberCount}
				<span class="text-text-3"
					>{m.admin_settings_manage_in()}
					<a href="/admin/directory/users" class="text-accent hover:underline"
						>{m.admin_users_title()}</a
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
