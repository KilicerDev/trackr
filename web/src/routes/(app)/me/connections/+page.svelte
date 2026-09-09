<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { ActionResult } from '@sveltejs/kit';
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import SecretReveal from '$lib/components/admin/SecretReveal.svelte';
	import { confirm } from '$lib/components/confirm.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let busyId = $state<string | null>(null);
	let copied = $state<string | null>(null);

	// New-key form: inline card, secret shown once after a successful create.
	let keyFormOpen = $state(false);
	let keySubmitting = $state(false);
	let keyError = $state<string | null>(null);
	let keyName = $state('');
	let keyExpiry = $state('90');
	let createdSecret = $state<string | null>(null);

	const fmt = new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' });
	const fmtDate = new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium' });

	const connCols = '1.6fr 1.1fr 1.5fr 40px';
	const keyCols = '2fr 0.9fr 1.1fr 1.1fr 80px';
	const deviceCols = '1.6fr 0.8fr 1.1fr 1.1fr 40px';

	type Key = PageData['keys'][number];
	type Conn = PageData['connections'][number];
	type Device = PageData['devices'][number];

	const expiryOptions = [
		{ value: '30', label: m.api_keys_expiry_days({ count: 30 }) },
		{ value: '90', label: m.api_keys_expiry_days({ count: 90 }) },
		{ value: '365', label: m.api_keys_expiry_year() },
		{ value: '', label: m.api_keys_expiry_never() }
	];

	const statusOf = (k: Key): { label: string; dot: string } =>
		k.status === 'active'
			? { label: m.api_keys_status_active(), dot: 'bg-emerald-400' }
			: k.status === 'expired'
				? { label: m.api_keys_status_expired(), dot: 'bg-[#e9c46a]' }
				: { label: m.api_keys_status_revoked(), dot: 'bg-text-4' };

	async function copy(text: string, key: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = key;
			showToast('ok', m.common_copied());
			setTimeout(() => (copied = null), 2000);
		} catch {
			showToast('err', m.webhooks_secret_copy_failed());
		}
	}

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
							m.connections_err_save_failed()
					);
				}
			};
		};
	}

	function onCreateKey() {
		keySubmitting = true;
		keyError = null;
		return async ({ result }: { result: ActionResult }) => {
			keySubmitting = false;
			if (result.type === 'success') {
				createdSecret = (result.data as { secret?: string } | undefined)?.secret ?? null;
				keyName = '';
				keyExpiry = '90';
				await invalidateAll();
			} else if (result.type === 'failure') {
				keyError =
					(result.data as { message?: string } | undefined)?.message ??
					m.api_keys_err_save_failed();
			}
		};
	}

	function closeKeyForm() {
		keyFormOpen = false;
		createdSecret = null;
		keyError = null;
	}

	async function askRevokeConnection(c: Conn, form: HTMLFormElement) {
		const ok = await confirm({
			title: m.mcp_revoke_title(),
			message: m.connections_mcp_revoke_message({
				client: c.clientName ?? m.mcp_unknown_client()
			}),
			confirmLabel: m.mcp_revoke(),
			tone: 'warn',
			icon: 'shield'
		});
		if (ok) form.requestSubmit();
	}

	async function askRevokeKey(k: Key, form: HTMLFormElement) {
		const ok = await confirm({
			title: m.api_keys_revoke_title({ name: k.name }),
			message: m.connections_keys_revoke_message(),
			confirmLabel: m.api_keys_revoke(),
			tone: 'warn',
			icon: 'shield'
		});
		if (ok) form.requestSubmit();
	}

	async function askDeleteKey(k: Key, form: HTMLFormElement) {
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

	async function askRemoveDevice(d: Device, form: HTMLFormElement) {
		const ok = await confirm({
			title: m.devices_remove_title(),
			message: m.connections_devices_remove_message({
				device: d.deviceName ?? d.platform
			}),
			confirmLabel: m.common_remove(),
			tone: 'warn',
			icon: 'shield'
		});
		if (ok) form.requestSubmit();
	}
</script>

<div class="mb-6">
	<h1 class="text-[26px] font-semibold tracking-[-0.014em]">{m.connections_title()}</h1>
	<p class="mt-1 max-w-xl text-[14px] text-text-3">{m.connections_subtitle()}</p>
</div>

<!-- MCP -->
<section class="mb-6 rounded-2xl border border-border bg-bg-elev p-5">
	<div class="flex items-start gap-3">
		<span
			class="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg {data.mcp.enabled
				? 'bg-emerald-400/15 text-emerald-400'
				: 'bg-surface text-text-4'}"
		>
			<Icon name="sparkle" size={16} />
		</span>
		<div class="min-w-0 flex-1">
			<h2 class="text-[15px] font-semibold text-text">{m.connections_mcp_title()}</h2>
			<p class="mt-0.5 text-[13px] text-text-3">
				{data.mcp.enabled ? m.connections_mcp_enabled() : m.connections_mcp_disabled()}
			</p>
		</div>
		<span
			class="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-medium {data
				.mcp.enabled
				? 'bg-emerald-400/15 text-emerald-400'
				: 'bg-surface text-text-3'}"
		>
			<span class="h-1.5 w-1.5 rounded-full {data.mcp.enabled ? 'bg-emerald-400' : 'bg-text-4'}"
			></span>
			{data.mcp.enabled ? m.mcp_access_enabled() : m.mcp_access_disabled()}
		</span>
	</div>

	{#if data.mcp.enabled}
		<div class="mt-5 flex flex-col gap-4 border-t border-border pt-5">
			{#each [{ key: 'url', label: m.mcp_setup_url_label(), value: data.mcp.url }, { key: 'cc', label: m.mcp_setup_claude_code_label(), value: data.mcp.claudeCodeCommand }] as item (item.key)}
				<div>
					<div class="mb-1.5 text-[13px] font-medium text-text-2">{item.label}</div>
					<div class="flex items-center gap-2">
						<code
							class="min-w-0 flex-1 truncate rounded-md border border-border bg-bg px-2.5 py-1.5 font-mono text-[12.5px] text-text select-all"
							>{item.value}</code
						>
						<button
							type="button"
							onclick={() => copy(item.value, item.key)}
							class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[13px] text-text-2 transition-colors hover:text-text"
						>
							<Icon name={copied === item.key ? 'check' : 'link'} size={13} />
							{copied === item.key ? m.common_copied() : m.common_copy()}
						</button>
					</div>
				</div>
			{/each}
			<p class="flex gap-2 text-[13px] text-text-3">
				<Icon name="sparkle" size={13} class="mt-0.5 shrink-0 text-text-4" />
				<span>{m.mcp_setup_claude_ai_hint()}</span>
			</p>
		</div>

		<div class="mt-5 border-t border-border pt-5">
			<h3 class="mb-3 text-[13px] font-medium text-text-2">
				{m.connections_mcp_connections_title()}
			</h3>
			<div class="overflow-hidden rounded-xl border border-border bg-bg">
				{#if data.connections.length === 0}
					<EmptyState
						icon="link"
						title={m.connections_mcp_empty_title()}
						hint={m.connections_mcp_empty_hint()}
					/>
				{:else}
					<div
						class="grid h-9 items-center gap-3 border-b border-border px-4 text-[12px] tracking-[0.08em] text-text-4 uppercase"
						style:grid-template-columns={connCols}
					>
						<span>{m.mcp_col_client()}</span>
						<span>{m.mcp_col_created()}</span>
						<span>{m.mcp_col_expires()}</span>
						<span></span>
					</div>
					{#each data.connections as c (c.id)}
						{@const accessExpired =
							!!c.accessTokenExpiresAt && c.accessTokenExpiresAt.getTime() <= Date.now()}
						<div
							class="grid items-center gap-3 border-b border-border/40 px-4 py-2.5 text-[14px] last:border-b-0"
							style:grid-template-columns={connCols}
						>
							<div class="min-w-0">
								<span class="block truncate font-medium text-text"
									>{c.clientName ?? m.mcp_unknown_client()}</span
								>
								<span class="block truncate font-mono text-[12px] text-text-4"
									>{c.clientId ?? ''}</span
								>
							</div>
							<div class="truncate font-mono text-[12px] text-text-3">
								{c.createdAt ? fmt.format(c.createdAt) : '—'}
							</div>
							<div
								class="min-w-0 font-mono text-[12px] {accessExpired
									? 'text-text-4'
									: 'text-text-3'}"
							>
								<span class="block truncate">
									{c.accessTokenExpiresAt
										? m.mcp_expires_access({ date: fmt.format(c.accessTokenExpiresAt) })
										: '—'}
								</span>
								<span class="block truncate text-text-4">
									{c.refreshTokenExpiresAt
										? m.mcp_expires_refresh({ date: fmt.format(c.refreshTokenExpiresAt) })
										: ''}
								</span>
							</div>
							<div class="flex items-center justify-end">
								<form
									method="post"
									action="?/connectionRevoke"
									use:enhance={simple(m.mcp_revoked_toast())}
								>
									<input type="hidden" name="id" value={c.id} />
									<button
										type="button"
										disabled={busyId === c.id}
										onclick={(e) => askRevokeConnection(c, e.currentTarget.form!)}
										title={m.mcp_revoke()}
										aria-label={m.mcp_revoke()}
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
		</div>
	{/if}
</section>

<!-- API keys -->
<section class="mb-6 rounded-2xl border border-border bg-bg-elev p-5">
	<div class="flex items-start gap-3">
		<span class="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface text-text-3">
			<Icon name="shield" size={16} />
		</span>
		<div class="min-w-0 flex-1">
			<h2 class="text-[15px] font-semibold text-text">{m.connections_keys_title()}</h2>
			<p class="mt-0.5 text-[13px] text-text-3">
				{data.canCreateKeys ? m.connections_keys_hint() : m.connections_keys_hint_managed()}
			</p>
		</div>
		{#if data.canCreateKeys && !keyFormOpen}
			<Button variant="primary" size="sm" onclick={() => (keyFormOpen = true)}>
				<Icon name="plus" size={14} />
				{m.connections_keys_new()}
			</Button>
		{/if}
	</div>

	{#if keyFormOpen}
		<div class="mt-5 rounded-xl border border-border bg-bg p-4">
			{#if createdSecret}
				<SecretReveal
					secret={createdSecret}
					title={m.api_keys_secret_shown_once()}
					description={m.api_keys_secret_shown_once_desc()}
				/>
				<div class="mt-4 flex justify-end">
					<Button variant="primary" size="sm" onclick={closeKeyForm}>
						{m.connections_keys_done()}
					</Button>
				</div>
			{:else}
				<form
					method="post"
					action="?/keyCreate"
					use:enhance={onCreateKey}
					class="flex flex-col gap-4"
				>
					<div class="grid gap-4 sm:grid-cols-[1fr_180px]">
						<label class="flex flex-col gap-1.5">
							<span class="text-[13px] font-medium text-text-2">{m.api_keys_field_name()}</span>
							<input
								name="name"
								bind:value={keyName}
								maxlength="120"
								required
								placeholder={m.connections_keys_name_placeholder()}
								class="h-9 rounded-md border border-border bg-bg-elev px-3 text-[14px] text-text outline-none placeholder:text-text-4 focus:border-border-strong"
							/>
						</label>
						<label class="flex flex-col gap-1.5">
							<span class="text-[13px] font-medium text-text-2">{m.api_keys_field_expiry()}</span>
							<select
								name="expiry"
								bind:value={keyExpiry}
								class="h-9 rounded-md border border-border bg-bg-elev px-2.5 text-[14px] text-text outline-none focus:border-border-strong"
							>
								{#each expiryOptions as o (o.value)}
									<option value={o.value}>{o.label}</option>
								{/each}
							</select>
						</label>
					</div>
					{#if keyError}
						<p class="text-[13px] text-prio-urgent">{keyError}</p>
					{/if}
					<div class="flex justify-end gap-2">
						<Button variant="default" size="sm" type="button" onclick={closeKeyForm}>
							{m.common_cancel()}
						</Button>
						<Button
							variant="primary"
							size="sm"
							type="submit"
							disabled={keySubmitting || !keyName.trim()}
						>
							{keySubmitting ? m.common_saving() : m.api_keys_create()}
						</Button>
					</div>
				</form>
			{/if}
		</div>
	{/if}

	<div class="mt-5 overflow-hidden rounded-xl border border-border bg-bg">
		{#if data.keys.length === 0}
			<EmptyState
				icon="shield"
				title={m.connections_keys_empty_title()}
				hint={data.canCreateKeys
					? m.connections_keys_empty_hint()
					: m.connections_keys_empty_hint_managed()}
			/>
		{:else}
			<div
				class="grid h-9 items-center gap-3 border-b border-border px-4 text-[12px] tracking-[0.08em] text-text-4 uppercase"
				style:grid-template-columns={keyCols}
			>
				<span>{m.api_keys_col_name()}</span>
				<span>{m.api_keys_col_status()}</span>
				<span>{m.api_keys_col_last_used()}</span>
				<span>{m.api_keys_col_expires()}</span>
				<span></span>
			</div>
			{#each data.keys as k (k.id)}
				{@const st = statusOf(k)}
				<div
					class="grid items-center gap-3 border-b border-border/40 px-4 py-2.5 text-[14px] last:border-b-0"
					style:grid-template-columns={keyCols}
				>
					<div class="min-w-0">
						<span class="block truncate font-medium text-text">{k.name}</span>
						<span class="block truncate font-mono text-[12px] text-text-4">{k.keyPrefix}…</span>
					</div>
					<div class="flex items-center gap-2">
						<span class="h-2 w-2 rounded-full {st.dot}"></span>
						<span class="text-text-2">{st.label}</span>
					</div>
					<div class="truncate font-mono text-[12px] text-text-3">
						{k.lastUsedAt ? fmt.format(k.lastUsedAt) : '—'}
					</div>
					<div class="truncate font-mono text-[12px] text-text-3">
						{k.expiresAt ? fmtDate.format(k.expiresAt) : m.api_keys_expiry_never()}
					</div>
					<div class="flex items-center justify-end gap-0.5">
						{#if k.status === 'active'}
							<form
								method="post"
								action="?/keyRevoke"
								use:enhance={simple(m.api_keys_revoked_toast())}
							>
								<input type="hidden" name="id" value={k.id} />
								<button
									type="button"
									disabled={busyId === k.id}
									onclick={(e) => askRevokeKey(k, e.currentTarget.form!)}
									title={m.api_keys_revoke()}
									aria-label={m.api_keys_revoke()}
									class="grid h-8 w-8 place-items-center rounded-lg text-text-3 transition-colors hover:bg-surface hover:text-[#e9c46a]"
								>
									<Icon name="shield" size={14} />
								</button>
							</form>
						{/if}
						<form
							method="post"
							action="?/keyDelete"
							use:enhance={simple(m.api_keys_deleted_toast())}
						>
							<input type="hidden" name="id" value={k.id} />
							<button
								type="button"
								disabled={busyId === k.id}
								onclick={(e) => askDeleteKey(k, e.currentTarget.form!)}
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
</section>

<!-- Devices -->
<section class="rounded-2xl border border-border bg-bg-elev p-5">
	<div class="flex items-start gap-3">
		<span class="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface text-text-3">
			<Icon name="bell" size={16} />
		</span>
		<div class="min-w-0 flex-1">
			<h2 class="text-[15px] font-semibold text-text">{m.connections_devices_title()}</h2>
			<p class="mt-0.5 text-[13px] text-text-3">{m.connections_devices_hint()}</p>
		</div>
	</div>

	<div class="mt-5 overflow-hidden rounded-xl border border-border bg-bg">
		{#if data.devices.length === 0}
			<EmptyState
				icon="bell"
				title={m.connections_devices_empty_title()}
				hint={m.connections_devices_empty_hint()}
			/>
		{:else}
			<div
				class="grid h-9 items-center gap-3 border-b border-border px-4 text-[12px] tracking-[0.08em] text-text-4 uppercase"
				style:grid-template-columns={deviceCols}
			>
				<span>{m.devices_col_device()}</span>
				<span>{m.devices_col_platform()}</span>
				<span>{m.devices_col_registered()}</span>
				<span>{m.devices_col_last_seen()}</span>
				<span></span>
			</div>
			{#each data.devices as d (d.id)}
				<div
					class="grid items-center gap-3 border-b border-border/40 px-4 py-2.5 text-[14px] last:border-b-0"
					style:grid-template-columns={deviceCols}
				>
					<div class="min-w-0">
						<span class="block truncate font-medium text-text">{d.deviceName ?? d.platform}</span>
						<span class="block truncate font-mono text-[12px] text-text-4">{d.tokenPrefix}…</span>
					</div>
					<div class="truncate font-mono text-[12px] text-text-3">{d.platform}</div>
					<div class="truncate font-mono text-[12px] text-text-3">
						{d.createdAt ? fmt.format(d.createdAt) : '—'}
					</div>
					<div class="truncate font-mono text-[12px] text-text-3">
						{d.lastSeenAt ? fmt.format(d.lastSeenAt) : '—'}
					</div>
					<div class="flex items-center justify-end">
						<form
							method="post"
							action="?/deviceRemove"
							use:enhance={simple(m.connections_devices_removed_toast())}
						>
							<input type="hidden" name="id" value={d.id} />
							<button
								type="button"
								disabled={busyId === d.id}
								onclick={(e) => askRemoveDevice(d, e.currentTarget.form!)}
								title={m.common_remove()}
								aria-label={m.common_remove()}
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
</section>
