<script lang="ts">
	import { pageTitle } from '$lib/brand';
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
	// Writable derived: the draft follows the server value until edited, and
	// re-syncs after a save invalidates the page data.
	let instructions = $derived(data.instructions);
	let instructionsSaving = $state(false);
	let instructionsError = $state<string | null>(null);
	const instructionsDirty = $derived(instructions.trim() !== data.instructions.trim());
	const instructionsOver = $derived(instructions.trim().length > data.instructionsMax);

	const connCols = '1.6fr 1.6fr 1.1fr 1.4fr 48px';
	const fmt = new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' });

	type Conn = PageData['connections'][number];
	type Guide = PageData['guides'][number];
	const guideCols = '2fr 1.4fr 1fr 0.9fr 120px';

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

	function onSaveInstructions() {
		instructionsSaving = true;
		instructionsError = null;
		return async ({ result }: { result: ActionResult }) => {
			instructionsSaving = false;
			if (result.type === 'success') {
				showToast('ok', m.mcp_instructions_saved_toast());
				await invalidateAll();
			} else if (result.type === 'failure') {
				instructionsError =
					(result.data as { message?: string } | undefined)?.message ?? m.mcp_err_save_failed();
			}
		};
	}

	async function askDeleteGuide(g: Guide, form: HTMLFormElement) {
		const ok = await confirm({
			title: m.mcp_guide_delete_title(),
			message: m.mcp_guide_delete_message({ title: g.title }),
			confirmLabel: m.mcp_guide_delete(),
			tone: 'danger',
			icon: 'trash'
		});
		if (ok) form.requestSubmit();
	}

	function hostOf(url: string): string {
		try {
			return new URL(url).hostname;
		} catch {
			return url;
		}
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

<svelte:head
	><title>{pageTitle(`${m.settings_tab_mcp()} · ${m.admin_settings_title()}`)}</title></svelte:head
>

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

<!-- Instructions -->
<section class="mb-5 rounded-2xl border border-border bg-bg-elev p-5">
	<h2 class="text-[15px] font-semibold text-text">{m.mcp_instructions_title()}</h2>
	<p class="mt-0.5 max-w-2xl text-[13px] text-text-3">{m.mcp_instructions_hint()}</p>
	<form method="post" action="?/saveInstructions" use:enhance={onSaveInstructions} class="mt-4">
		<textarea
			name="instructions"
			bind:value={instructions}
			rows="7"
			spellcheck="false"
			placeholder={m.mcp_instructions_placeholder()}
			class="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2.5 font-mono text-[13px] leading-relaxed text-text outline-none placeholder:text-text-3 focus:border-border-strong"
		></textarea>
		<div class="mt-2 flex flex-wrap items-center gap-3">
			<span class="text-[12px] {instructionsOver ? 'text-[#ef7a6d]' : 'text-text-4'}">
				{m.mcp_instructions_chars({
					count: instructions.trim().length.toLocaleString(getLocale()),
					max: data.instructionsMax.toLocaleString(getLocale())
				})}
			</span>
			<span class="text-[12px] text-text-4">· {m.mcp_instructions_note_reconnect()}</span>
			{#if instructionsError}
				<span class="text-[12px] text-[#ef7a6d]">{instructionsError}</span>
			{/if}
			<div class="ml-auto flex items-center gap-2">
				{#if data.instructionsUpdatedAt}
					<span class="text-[12px] text-text-4"
						>{m.mcp_instructions_updated({ date: fmt.format(data.instructionsUpdatedAt) })}</span
					>
				{/if}
				<button
					type="submit"
					disabled={instructionsSaving || !instructionsDirty || instructionsOver}
					class="inline-flex h-8 items-center rounded-lg border border-transparent bg-accent px-3 text-[13px] font-medium text-white shadow-btn transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
				>
					{instructionsSaving ? m.common_saving() : m.mcp_instructions_save()}
				</button>
			</div>
		</div>
	</form>
	<p class="mt-3 flex gap-2 text-[12px] text-text-4">
		<Icon name="sparkle" size={12} class="mt-0.5 shrink-0" />
		<span>{m.mcp_instructions_builtin_note()}</span>
	</p>
</section>

<!-- Guides -->
<div class="mb-3 flex items-end gap-3">
	<div class="min-w-0 flex-1">
		<h2 class="text-[15px] font-semibold text-text">{m.mcp_guides_title()}</h2>
		<p class="mt-0.5 max-w-2xl text-[13px] text-text-3">{m.mcp_guides_hint()}</p>
	</div>
	<a
		href="/admin/settings/mcp/guides/new"
		class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-transparent bg-accent px-3 text-[13px] font-medium text-white shadow-btn hover:bg-accent-strong"
	>
		<Icon name="plus" size={13} />
		{m.mcp_guides_new()}
	</a>
</div>
<div class="mb-6 overflow-hidden rounded-2xl border border-border bg-bg-elev">
	{#if data.guides.length === 0}
		<EmptyState icon="book" title={m.mcp_guides_empty_title()} hint={m.mcp_guides_empty_hint()} />
	{:else}
		<div
			class="grid h-9 items-center gap-3 border-b border-border px-5 text-[12px] tracking-[0.08em] text-text-4 uppercase"
			style:grid-template-columns={guideCols}
		>
			<span>{m.mcp_guides_col_title()}</span>
			<span>{m.mcp_guides_col_source()}</span>
			<span>{m.mcp_guides_col_updated()}</span>
			<span>{m.mcp_guides_col_status()}</span>
			<span></span>
		</div>
		{#each data.guides as g (g.id)}
			<div
				class="grid items-center gap-3 border-b border-border/40 px-5 py-2.5 text-[14px] last:border-b-0"
				style:grid-template-columns={guideCols}
			>
				<div class="min-w-0">
					<a
						href="/admin/settings/mcp/guides/{g.id}"
						class="block truncate font-medium text-text hover:underline">{g.title}</a
					>
					<span class="block truncate font-mono text-[12px] text-text-4">{g.slug}</span>
				</div>
				<div class="min-w-0 text-[12px] text-text-3">
					{#if g.sourceUrl}
						<a
							href={g.sourceUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="block truncate hover:text-text hover:underline">{hostOf(g.sourceUrl)}</a
						>
						<span class="block truncate text-text-4">
							{g.fetchedAt ? m.mcp_guide_fetched_at({ date: fmt.format(g.fetchedAt) }) : ''}
						</span>
					{:else}
						<span class="block truncate">{m.mcp_guide_source_manual()}</span>
						<span class="block truncate text-text-4"
							>{m.mcp_guide_chars_short({
								count: g.bodyChars.toLocaleString(getLocale())
							})}</span
						>
					{/if}
				</div>
				<div class="truncate font-mono text-[12px] text-text-3">{fmt.format(g.updatedAt)}</div>
				<div class="flex items-center gap-2">
					<span class="h-2 w-2 rounded-full {g.enabled ? 'bg-emerald-400' : 'bg-text-4'}"></span>
					<span class="text-text-2"
						>{g.enabled ? m.mcp_guide_enabled() : m.mcp_guide_disabled()}</span
					>
				</div>
				<div class="flex items-center justify-end gap-1">
					{#if g.sourceUrl}
						<form
							method="post"
							action="?/guideRefresh"
							use:enhance={simple(m.mcp_guide_fetched_toast(), 'id')}
						>
							<input type="hidden" name="id" value={g.id} />
							<button
								type="submit"
								disabled={busyId === g.id}
								title={m.mcp_guide_refresh()}
								aria-label={m.mcp_guide_refresh()}
								class="grid h-8 w-8 place-items-center rounded-lg text-text-3 transition-colors hover:bg-surface hover:text-text disabled:opacity-50"
							>
								<Icon name="refresh" size={14} class={busyId === g.id ? 'animate-spin' : ''} />
							</button>
						</form>
					{/if}
					<form
						method="post"
						action={g.enabled ? '?/guideDisable' : '?/guideEnable'}
						use:enhance={simple(
							g.enabled ? m.mcp_guide_disabled_toast() : m.mcp_guide_enabled_toast(),
							'id'
						)}
					>
						<input type="hidden" name="id" value={g.id} />
						<button
							type="submit"
							disabled={busyId === g.id}
							class="inline-flex h-8 items-center rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text-2 transition-colors hover:text-text disabled:opacity-50"
						>
							{g.enabled ? m.mcp_guide_disable() : m.mcp_guide_enable()}
						</button>
					</form>
					<form
						method="post"
						action="?/guideDelete"
						use:enhance={simple(m.mcp_guide_deleted_toast(), 'id')}
					>
						<input type="hidden" name="id" value={g.id} />
						<button
							type="button"
							disabled={busyId === g.id}
							onclick={(e) => askDeleteGuide(g, e.currentTarget.form!)}
							title={m.mcp_guide_delete()}
							aria-label={m.mcp_guide_delete()}
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

<!-- Connections -->
<div class="mb-3">
	<h2 class="text-[15px] font-semibold text-text">{m.mcp_connections_title()}</h2>
	<p class="mt-0.5 text-[13px] text-text-3">
		{m.mcp_connections_hint()}
		<a
			href="/admin/directory/users"
			class="text-text-2 underline decoration-border underline-offset-2 hover:text-text"
			>{m.mcp_access_moved_hint()}</a
		>
	</p>
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
