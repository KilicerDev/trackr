<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { ActionResult } from '@sveltejs/kit';
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import CreateApiKeyModal from '$lib/components/admin/CreateApiKeyModal.svelte';
	import { confirm } from '$lib/components/confirm.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let createOpen = $state(false);
	let busyId = $state<string | null>(null);

	const cols = '2fr 1.6fr 0.9fr 1.1fr 1.1fr 88px';
	const fmt = new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' });
	const fmtDate = new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium' });

	type Key = PageData['keys'][number];
	const statusOf = (k: Key): { label: string; dot: string } =>
		k.status === 'active'
			? { label: m.api_keys_status_active(), dot: 'bg-emerald-400' }
			: k.status === 'expired'
				? { label: m.api_keys_status_expired(), dot: 'bg-[#e9c46a]' }
				: { label: m.api_keys_status_revoked(), dot: 'bg-text-4' };

	function simple(okMsg: string) {
		return ({ formData }: { formData: FormData }) => {
			busyId = String(formData.get('id') ?? '');
			return async ({ result }: { result: ActionResult }) => {
				busyId = null;
				if (result.type === 'success') {
					showToast('ok', okMsg);
					await invalidateAll();
				} else if (result.type === 'failure') {
					showToast(
						'err',
						(result.data as { message?: string } | undefined)?.message ??
							m.api_keys_err_save_failed()
					);
				}
			};
		};
	}

	async function askRevoke(k: Key, form: HTMLFormElement) {
		const ok = await confirm({
			title: m.api_keys_revoke_title({ name: k.name }),
			message: m.api_keys_revoke_message({ user: k.user.name }),
			confirmLabel: m.api_keys_revoke(),
			tone: 'warn',
			icon: 'shield'
		});
		if (ok) form.requestSubmit();
	}
	async function askDelete(k: Key, form: HTMLFormElement) {
		const ok = await confirm({
			title: m.api_keys_delete_title({ name: k.name }),
			message:
				k.status === 'active' ? m.api_keys_delete_message_active() : m.api_keys_delete_message(),
			confirmLabel: m.common_delete(),
			tone: 'danger',
			icon: 'trash'
		});
		if (ok) form.requestSubmit();
	}
</script>

<svelte:head><title>{m.settings_tab_api_keys()} · {m.admin_settings_title()}</title></svelte:head>

<div class="mb-6 flex items-start gap-4">
	<div class="min-w-0 flex-1">
		<h1 class="text-[26px] font-semibold tracking-[-0.014em]">{m.api_keys_title()}</h1>
		<p class="mt-1 max-w-xl text-[14px] text-text-3">{m.api_keys_description()}</p>
	</div>
	<Button variant="primary" onclick={() => (createOpen = true)}>
		<Icon name="plus" size={14} />
		{m.api_keys_new()}
	</Button>
</div>

<div class="overflow-hidden rounded-2xl border border-border bg-bg-elev">
	{#if data.keys.length === 0}
		<EmptyState icon="shield" title={m.api_keys_empty_title()} hint={m.api_keys_empty_hint()} />
	{:else}
		<div
			class="grid h-9 items-center gap-3 border-b border-border px-5 text-[12px] tracking-[0.08em] text-text-4 uppercase"
			style:grid-template-columns={cols}
		>
			<span>{m.api_keys_col_name()}</span>
			<span>{m.api_keys_col_user()}</span>
			<span>{m.api_keys_col_status()}</span>
			<span>{m.api_keys_col_last_used()}</span>
			<span>{m.api_keys_col_expires()}</span>
			<span></span>
		</div>
		{#each data.keys as k (k.id)}
			{@const st = statusOf(k)}
			<div
				class="grid items-center gap-3 border-b border-border/40 px-5 py-2.5 text-[14px] last:border-b-0 {k.status !==
				'active'
					? 'opacity-70'
					: ''}"
				style:grid-template-columns={cols}
			>
				<div class="min-w-0">
					<span class="block truncate font-medium text-text">{k.name}</span>
					<span class="block truncate font-mono text-[12px] text-text-4">{k.keyPrefix}…</span>
				</div>
				<div class="min-w-0">
					<span class="block truncate text-text-2">{k.user.name}</span>
					<span class="block truncate text-[12px] text-text-4">{k.user.email}</span>
				</div>
				<div class="flex items-center gap-2">
					<span class="h-2 w-2 rounded-full {st.dot}"></span>
					<span class="text-text-2">{st.label}</span>
				</div>
				<div class="truncate font-mono text-[12px] text-text-3">
					{k.lastUsedAt ? fmt.format(k.lastUsedAt) : m.webhooks_never()}
				</div>
				<div class="truncate font-mono text-[12px] text-text-3">
					{k.expiresAt ? fmtDate.format(k.expiresAt) : m.api_keys_expiry_never()}
				</div>
				<div class="flex items-center justify-end gap-1">
					{#if k.status === 'active'}
						<form method="post" action="?/revoke" use:enhance={simple(m.api_keys_revoked_toast())}>
							<input type="hidden" name="id" value={k.id} />
							<button
								type="button"
								disabled={busyId === k.id}
								onclick={(e) => askRevoke(k, e.currentTarget.form!)}
								title={m.api_keys_revoke()}
								aria-label={m.api_keys_revoke()}
								class="grid h-8 w-8 place-items-center rounded-lg text-text-3 transition-colors hover:bg-surface hover:text-[#e9c46a]"
							>
								<Icon name="shield" size={14} />
							</button>
						</form>
					{/if}
					<form method="post" action="?/delete" use:enhance={simple(m.api_keys_deleted_toast())}>
						<input type="hidden" name="id" value={k.id} />
						<button
							type="button"
							disabled={busyId === k.id}
							onclick={(e) => askDelete(k, e.currentTarget.form!)}
							title={m.common_delete()}
							aria-label={m.common_delete()}
							class="grid h-8 w-8 place-items-center rounded-lg text-text-3 transition-colors hover:bg-surface hover:text-[#ef7a6d]"
						>
							<Icon name="trash" size={14} />
						</button>
					</form>
				</div>
			</div>
		{/each}
	{/if}
</div>

<p class="mt-3 text-[12px] text-text-4">{m.api_keys_footnote()}</p>

<CreateApiKeyModal
	open={createOpen}
	onclose={() => {
		createOpen = false;
	}}
	users={data.users}
/>
