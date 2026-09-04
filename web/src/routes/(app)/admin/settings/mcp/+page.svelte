<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { ActionResult } from '@sveltejs/kit';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { confirm } from '$lib/components/confirm.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let busyId = $state<string | null>(null);
	let copied = $state<string | null>(null);

	const userCols = '2fr 0.9fr 1.1fr 0.9fr 96px';
	const connCols = '1.6fr 1.6fr 1.1fr 1.4fr 48px';
	const fmt = new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' });

	type Conn = PageData['connections'][number];
	type Row = PageData['users'][number];

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

	function simple(okMsg: string, field: string) {
		return ({ formData }: { formData: FormData }) => {
			busyId = String(formData.get(field) ?? '');
			return async ({ result }: { result: ActionResult }) => {
				busyId = null;
				if (result.type === 'success') {
					showToast('ok', okMsg);
					await invalidateAll();
				} else if (result.type === 'failure') {
					showToast(
						'err',
						(result.data as { message?: string } | undefined)?.message ?? m.mcp_err_save_failed()
					);
				}
			};
		};
	}

	async function askDisable(u: Row, form: HTMLFormElement) {
		const ok = await confirm({
			title: m.mcp_disable_title({ name: u.name }),
			message: m.mcp_disable_message({ name: u.name }),
			confirmLabel: m.mcp_disable(),
			tone: 'warn',
			icon: 'shield'
		});
		if (ok) form.requestSubmit();
	}

	async function askRevoke(c: Conn, form: HTMLFormElement) {
		const ok = await confirm({
			title: m.mcp_revoke_title(),
			message: m.mcp_revoke_message({
				client: c.clientName ?? m.mcp_unknown_client(),
				user: c.userName ?? m.mcp_unknown_user()
			}),
			confirmLabel: m.mcp_revoke(),
			tone: 'danger',
			icon: 'trash'
		});
		if (ok) form.requestSubmit();
	}
</script>

<svelte:head><title>{m.settings_tab_mcp()} · {m.admin_settings_title()}</title></svelte:head>

<div class="mb-6">
	<h1 class="text-[26px] font-semibold tracking-[-0.014em]">{m.mcp_title()}</h1>
	<p class="mt-1 max-w-xl text-[14px] text-text-3">{m.mcp_description()}</p>
</div>

<!-- Setup -->
<section class="mb-5 rounded-2xl border border-border bg-bg-elev p-5">
	<h2 class="text-[15px] font-semibold text-text">{m.mcp_setup_title()}</h2>
	<div class="mt-4 flex flex-col gap-4">
		{#each [{ key: 'url', label: m.mcp_setup_url_label(), value: data.mcpUrl }, { key: 'cc', label: m.mcp_setup_claude_code_label(), value: data.claudeCodeCommand }] as item (item.key)}
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
		<ul class="flex flex-col gap-1.5 text-[13px] text-text-3">
			<li class="flex gap-2">
				<Icon name="sparkle" size={13} class="mt-0.5 shrink-0 text-text-4" />
				<span>{m.mcp_setup_claude_ai_hint()}</span>
			</li>
			<li class="flex gap-2">
				<Icon name="shield" size={13} class="mt-0.5 shrink-0 text-text-4" />
				<span>{m.mcp_setup_api_key_hint()}</span>
			</li>
		</ul>
	</div>
</section>

<!-- Users -->
<div class="mb-3">
	<h2 class="text-[15px] font-semibold text-text">{m.mcp_users_title()}</h2>
	<p class="mt-0.5 text-[13px] text-text-3">{m.mcp_users_hint()}</p>
</div>
<div class="mb-6 overflow-hidden rounded-2xl border border-border bg-bg-elev">
	<div
		class="grid h-9 items-center gap-3 border-b border-border px-5 text-[12px] tracking-[0.08em] text-text-4 uppercase"
		style:grid-template-columns={userCols}
	>
		<span>{m.mcp_col_user()}</span>
		<span>{m.mcp_col_role()}</span>
		<span>{m.mcp_col_access()}</span>
		<span>{m.mcp_col_connections()}</span>
		<span></span>
	</div>
	{#each data.users as u (u.id)}
		<div
			class="grid items-center gap-3 border-b border-border/40 px-5 py-2.5 text-[14px] last:border-b-0"
			style:grid-template-columns={userCols}
		>
			<div class="min-w-0">
				<span class="block truncate font-medium text-text">{u.name}</span>
				<span class="block truncate text-[12px] text-text-4">{u.email}</span>
			</div>
			<div class="truncate font-mono text-[12px] text-text-3">{u.role ?? 'user'}</div>
			<div class="flex items-center gap-2">
				<span class="h-2 w-2 rounded-full {u.enabled ? 'bg-emerald-400' : 'bg-text-4'}"></span>
				<span class="text-text-2">
					{u.enabled ? m.mcp_access_enabled() : m.mcp_access_disabled()}
				</span>
			</div>
			<div class="font-mono text-[12px] text-text-3">{u.connections}</div>
			<div class="flex items-center justify-end">
				{#if u.enabled}
					<form
						method="post"
						action="?/disable"
						use:enhance={simple(m.mcp_disabled_toast(), 'userId')}
					>
						<input type="hidden" name="userId" value={u.id} />
						<button
							type="button"
							disabled={busyId === u.id}
							onclick={(e) => askDisable(u, e.currentTarget.form!)}
							class="inline-flex h-8 items-center rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text-2 transition-colors hover:text-[#e9c46a] disabled:opacity-50"
						>
							{m.mcp_disable()}
						</button>
					</form>
				{:else}
					<form
						method="post"
						action="?/enable"
						use:enhance={simple(m.mcp_enabled_toast(), 'userId')}
					>
						<input type="hidden" name="userId" value={u.id} />
						<button
							type="submit"
							disabled={busyId === u.id}
							class="inline-flex h-8 items-center rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text-2 transition-colors hover:text-text disabled:opacity-50"
						>
							{m.mcp_enable()}
						</button>
					</form>
				{/if}
			</div>
		</div>
	{/each}
</div>

<!-- Connections -->
<div class="mb-3">
	<h2 class="text-[15px] font-semibold text-text">{m.mcp_connections_title()}</h2>
	<p class="mt-0.5 text-[13px] text-text-3">{m.mcp_connections_hint()}</p>
</div>
<div class="overflow-hidden rounded-2xl border border-border bg-bg-elev">
	{#if data.connections.length === 0}
		<EmptyState
			icon="link"
			title={m.mcp_connections_empty_title()}
			hint={m.mcp_connections_empty_hint()}
		/>
	{:else}
		<div
			class="grid h-9 items-center gap-3 border-b border-border px-5 text-[12px] tracking-[0.08em] text-text-4 uppercase"
			style:grid-template-columns={connCols}
		>
			<span>{m.mcp_col_user()}</span>
			<span>{m.mcp_col_client()}</span>
			<span>{m.mcp_col_created()}</span>
			<span>{m.mcp_col_expires()}</span>
			<span></span>
		</div>
		{#each data.connections as c (c.id)}
			{@const accessExpired =
				!!c.accessTokenExpiresAt && c.accessTokenExpiresAt.getTime() <= Date.now()}
			<div
				class="grid items-center gap-3 border-b border-border/40 px-5 py-2.5 text-[14px] last:border-b-0"
				style:grid-template-columns={connCols}
			>
				<div class="min-w-0">
					<span class="block truncate text-text-2">{c.userName ?? m.mcp_unknown_user()}</span>
					<span class="block truncate text-[12px] text-text-4">{c.userEmail ?? ''}</span>
				</div>
				<div class="min-w-0">
					<span class="block truncate font-medium text-text"
						>{c.clientName ?? m.mcp_unknown_client()}</span
					>
					<span class="block truncate font-mono text-[12px] text-text-4">{c.clientId ?? ''}</span>
				</div>
				<div class="truncate font-mono text-[12px] text-text-3">
					{c.createdAt ? fmt.format(c.createdAt) : '—'}
				</div>
				<div class="min-w-0 font-mono text-[12px] {accessExpired ? 'text-text-4' : 'text-text-3'}">
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
					<form method="post" action="?/revoke" use:enhance={simple(m.mcp_revoked_toast(), 'id')}>
						<input type="hidden" name="id" value={c.id} />
						<button
							type="button"
							disabled={busyId === c.id}
							onclick={(e) => askRevoke(c, e.currentTarget.form!)}
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

<p class="mt-3 text-[12px] text-text-4">{m.mcp_footnote()}</p>
