<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import type { ActionResult } from '@sveltejs/kit';
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import WebhookForm from '$lib/components/admin/WebhookForm.svelte';
	import SecretReveal from '$lib/components/admin/SecretReveal.svelte';
	import { confirm } from '$lib/components/confirm.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const sub = $derived(data.subscription);

	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let rotated = $state<string | null>(null);
	let busy = $state(false);
	let deleteForm = $state<HTMLFormElement>();

	const fmt = new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' });
	const cols = '1.6fr 1.4fr 1fr 0.6fr 0.6fr 0.7fr 0.9fr';

	const status = $derived(
		sub.enabled
			? { label: m.webhooks_status_active(), dot: 'bg-emerald-400' }
			: sub.disabledReason === 'failures'
				? { label: m.webhooks_status_auto_disabled(), dot: 'bg-[#ef7a6d]' }
				: { label: m.webhooks_status_disabled(), dot: 'bg-text-4' }
	);
	const deliveryDot: Record<string, string> = {
		success: 'bg-emerald-400',
		pending: 'bg-[#e9c46a]',
		failed: 'bg-[#f0a85c]',
		exhausted: 'bg-[#ef7a6d]',
		cancelled: 'bg-text-4'
	};
	const deliveryLabel = (s: string) =>
		({
			success: m.webhooks_delivery_success(),
			pending: m.webhooks_delivery_pending(),
			failed: m.webhooks_delivery_failed(),
			exhausted: m.webhooks_delivery_exhausted(),
			cancelled: m.webhooks_delivery_cancelled()
		})[s] ?? s;

	// Generic enhance for the small state-flipping actions.
	function simple(okMsg?: string) {
		return () => {
			busy = true;
			return async ({ result }: { result: ActionResult }) => {
				busy = false;
				if (result.type === 'success') {
					if (okMsg) showToast('ok', okMsg);
					const d = result.data as { secret?: string } | undefined;
					if (d?.secret) rotated = d.secret;
					await invalidateAll();
				} else if (result.type === 'failure') {
					showToast(
						'err',
						(result.data as { message?: string } | undefined)?.message ?? m.webhooks_err_save_failed()
					);
				} else if (result.type === 'redirect') {
					await goto(result.location);
				}
			};
		};
	}

	async function askDelete() {
		const ok = await confirm({
			title: m.webhooks_delete_title({ name: sub.name }),
			message: m.webhooks_delete_message(),
			confirmLabel: m.common_delete(),
			tone: 'danger',
			icon: 'trash'
		});
		if (ok) deleteForm?.requestSubmit();
	}
	async function askRotate(form: HTMLFormElement) {
		const ok = await confirm({
			title: m.webhooks_rotate_title(),
			message: m.webhooks_rotate_message(),
			confirmLabel: m.webhooks_rotate(),
			tone: 'warn',
			icon: 'refresh'
		});
		if (ok) form.requestSubmit();
	}

	const verifySnippet = `// Node.js — verify X-Trackr-Signature
const crypto = require('node:crypto');
const ts = req.headers['x-trackr-timestamp'];
const expected = 'sha256=' + crypto
  .createHmac('sha256', process.env.TRACKR_WEBHOOK_SECRET)
  .update(ts + '.' + rawBody)
  .digest('hex');
const ok = crypto.timingSafeEqual(
  Buffer.from(expected), Buffer.from(req.headers['x-trackr-signature']));`;

	const selectedHref = (id: string) => {
		const u = new URL(page.url);
		u.searchParams.set('delivery', id);
		return u.pathname + u.search;
	};
	const closeHref = () => {
		const u = new URL(page.url);
		u.searchParams.delete('delivery');
		return u.pathname + u.search;
	};
	const olderHref = () => {
		const last = data.deliveries.items[data.deliveries.items.length - 1];
		const u = new URL(page.url);
		u.searchParams.delete('delivery');
		u.searchParams.set('before', last.createdAt.toISOString());
		return u.pathname + u.search;
	};
</script>

<svelte:head><title>{sub.name} · {m.settings_tab_webhooks()}</title></svelte:head>

<div class="max-w-[960px]">
	<a
		href="/admin/settings/webhooks"
		class="mb-3 inline-flex items-center gap-1 text-[13px] text-text-3 hover:text-text"
		><Icon name="chevron" size={12} class="rotate-90" /> {m.webhooks_title()}</a
	>
	<div class="mb-6 flex flex-wrap items-start gap-4">
		<div class="min-w-0 flex-1">
			<h1 class="truncate text-[26px] font-semibold tracking-[-0.014em]">{sub.name}</h1>
			<div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
				<span class="flex items-center gap-2">
					<span class="h-2 w-2 rounded-full {status.dot}"></span>
					<span class="text-text-2">{status.label}</span>
				</span>
				<span class="truncate font-mono text-[12px] text-text-4">{sub.url}</span>
			</div>
			{#if !sub.enabled && sub.disabledReason === 'failures'}
				<div
					class="mt-3 rounded-lg border border-[#ef7a6d]/30 bg-[#ef7a6d]/5 px-3 py-2 text-[13px] text-text-2"
				>
					{m.webhooks_auto_disabled_notice()}
				</div>
			{/if}
		</div>
		<div class="flex items-center gap-2">
			<form method="post" action="?/test" use:enhance={simple(m.webhooks_test_sent())}>
				<Button type="submit" disabled={busy || !sub.enabled}>
					<Icon name="send" size={13} />
					{m.webhooks_send_test()}
				</Button>
			</form>
			<form
				method="post"
				action={sub.enabled ? '?/disable' : '?/enable'}
				use:enhance={simple(sub.enabled ? m.webhooks_disabled_toast() : m.webhooks_enabled_toast())}
			>
				<Button type="submit" disabled={busy}
					>{sub.enabled ? m.webhooks_disable() : m.webhooks_enable()}</Button
				>
			</form>
			<form method="post" action="?/delete" bind:this={deleteForm} use:enhance={simple()}>
				<Button type="button" onclick={askDelete} disabled={busy}>
					<Icon name="trash" size={13} class="text-[#ef7a6d]" />
					{m.common_delete()}
				</Button>
			</form>
		</div>
	</div>

	<section class="mb-5 rounded-2xl border border-border bg-bg-elev p-5">
		<div class="mb-3 text-[12px] tracking-[0.08em] text-text-4 uppercase">{m.webhooks_card_endpoint()}</div>
		<form
			method="post"
			action="?/update"
			use:enhance={() => {
				saving = true;
				saveError = null;
				return async ({ result }: { result: ActionResult }) => {
					saving = false;
					if (result.type === 'success') {
						showToast('ok', m.webhooks_saved());
						await invalidateAll();
					} else if (result.type === 'failure') {
						saveError =
							(result.data as { message?: string } | undefined)?.message ??
							m.webhooks_err_save_failed();
					}
				};
			}}
		>
			{#key sub.updatedAt}
				<WebhookForm options={data.options} initial={sub} />
			{/key}
			{#if saveError}
				<div class="mt-4 rounded-lg border border-prio-urgent/35 bg-prio-urgent/8 px-3 py-2 text-[14px] text-accent">
					{saveError}
				</div>
			{/if}
			<div class="mt-4 flex justify-end">
				<Button variant="primary" type="submit" disabled={saving}
					>{saving ? m.common_saving() : m.common_save_changes()}</Button
				>
			</div>
		</form>
	</section>

	<section class="mb-5 rounded-2xl border border-border bg-bg-elev p-5">
		<div class="mb-3 text-[12px] tracking-[0.08em] text-text-4 uppercase">{m.webhooks_card_secret()}</div>
		{#if rotated}
			<div class="mb-4"><SecretReveal secret={rotated} /></div>
		{/if}
		<div class="flex flex-wrap items-center gap-3">
			<code class="rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-[12.5px] text-text-3"
				>{sub.secretHint}</code
			>
			<form method="post" action="?/rotate" use:enhance={simple(m.webhooks_rotated_toast())}>
				<Button
					type="button"
					size="sm"
					disabled={busy}
					onclick={(e) => askRotate((e.currentTarget as HTMLElement).closest('form') as HTMLFormElement)}
				>
					<Icon name="refresh" size={13} />
					{m.webhooks_rotate()}
				</Button>
			</form>
			<span class="text-[12px] text-text-4">{m.webhooks_secret_hint_desc()}</span>
		</div>
		<details class="mt-4 group">
			<summary class="cursor-pointer text-[13px] text-text-2 hover:text-text">{m.webhooks_how_to_verify()}</summary>
			<div class="mt-2 space-y-2 text-[13px] text-text-3">
				<p>{m.webhooks_how_to_verify_desc()}</p>
				<ul class="list-disc space-y-0.5 pl-5 font-mono text-[12px] text-text-2">
					<li>X-Trackr-Event · X-Trackr-Delivery · X-Trackr-Timestamp · X-Trackr-Signature</li>
					<li>signature = "sha256=" + hex(HMAC_SHA256(secret, timestamp + "." + rawBody))</li>
				</ul>
				<pre
					class="overflow-x-auto rounded-lg border border-border bg-bg p-3 font-mono text-[12px] leading-relaxed text-text-2">{verifySnippet}</pre>
				<p class="text-text-4">{m.webhooks_url_policy_note()}</p>
			</div>
		</details>
	</section>

	<section class="overflow-hidden rounded-2xl border border-border bg-bg-elev">
		<div class="flex items-center justify-between px-5 pt-4 pb-3">
			<div class="text-[12px] tracking-[0.08em] text-text-4 uppercase">{m.webhooks_card_deliveries()}</div>
			<span class="text-[12px] text-text-4">{m.webhooks_deliveries_retention()}</span>
		</div>
		{#if data.deliveries.items.length === 0}
			<EmptyState icon="send" title={m.webhooks_deliveries_empty()} hint={m.webhooks_deliveries_empty_hint()} />
		{:else}
			<div
				class="grid h-9 items-center gap-3 border-y border-border px-5 text-[12px] tracking-[0.08em] text-text-4 uppercase"
				style:grid-template-columns={cols}
			>
				<span>{m.webhooks_col_event()}</span>
				<span>{m.webhooks_col_time()}</span>
				<span>{m.webhooks_col_status()}</span>
				<span>{m.webhooks_col_attempts()}</span>
				<span>{m.webhooks_col_code()}</span>
				<span>{m.webhooks_col_duration()}</span>
				<span class="text-right">{m.schedules_col_actions()}</span>
			</div>
			{#each data.deliveries.items as d (d.id)}
				{@const open = data.selected?.id === d.id}
				<div class="border-b border-border/40 last:border-b-0">
					<div
						class="grid items-center gap-3 px-5 py-2.5 text-[14px] {open ? 'bg-surface/40' : ''}"
						style:grid-template-columns={cols}
					>
						<a
							href={open ? closeHref() : selectedHref(d.id)}
							data-sveltekit-noscroll
							class="col-span-6 -mx-2 grid grid-cols-subgrid items-center gap-3 rounded-md px-2 py-1 transition-colors hover:bg-surface/60"
						>
							<span class="truncate font-mono text-[13px] text-text">{d.eventType}</span>
							<span class="truncate font-mono text-[12px] text-text-3">{fmt.format(d.createdAt)}</span>
							<span class="flex items-center gap-2">
								<span class="h-2 w-2 shrink-0 rounded-full {deliveryDot[d.status]}"></span>
								<span class="truncate text-text-2">{deliveryLabel(d.status)}</span>
							</span>
							<span class="font-mono text-text-3">{d.attempt}</span>
							<span class="font-mono text-text-3">{d.lastStatusCode ?? '—'}</span>
							<span class="font-mono text-text-3"
								>{d.lastDurationMs != null ? `${d.lastDurationMs} ms` : '—'}</span
							>
						</a>
						<span class="text-right">
							<form
								method="post"
								action="?/redeliver"
								class="inline"
								use:enhance={simple(m.webhooks_redelivered_toast())}
							>
								<input type="hidden" name="deliveryId" value={d.id} />
								<button
									type="submit"
									disabled={busy || d.status === 'pending'}
									class="inline-flex h-7 cursor-pointer items-center rounded-md border border-border bg-surface px-2.5 text-[13px] text-text-2 transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
								>
									{m.webhooks_redeliver()}
								</button>
							</form>
						</span>
					</div>
					{#if open && data.selected}
						{@const sel = data.selected}
						<div class="grid gap-4 border-t border-border/40 bg-bg/40 px-5 py-4 text-[13px] lg:grid-cols-2">
							<div class="min-w-0">
								<div class="mb-1.5 text-[12px] tracking-[0.08em] text-text-4 uppercase">{m.webhooks_col_attempts()}</div>
								{#if sel.attempts.length === 0}
									<div class="text-text-4">{m.webhooks_no_attempts()}</div>
								{:else}
									<div class="space-y-1.5">
										{#each sel.attempts as a (a.id)}
											<div class="rounded-md border border-border bg-surface px-2.5 py-1.5">
												<div class="flex items-center gap-2 font-mono text-[12px]">
													<span class="text-text-3">#{a.attempt}</span>
													<span class="text-text-4">{fmt.format(a.at)}</span>
													<span class={a.statusCode && a.statusCode < 300 ? 'text-emerald-400' : 'text-[#ef7a6d]'}
														>{a.statusCode ?? 'ERR'}</span
													>
													<span class="text-text-4">{a.durationMs} ms</span>
												</div>
												{#if a.error}<div class="mt-0.5 text-[12px] text-text-3">{a.error}</div>{/if}
												{#if a.responseSnippet}
													<pre class="mt-1 max-h-24 overflow-auto font-mono text-[11.5px] text-text-4">{a.responseSnippet}</pre>
												{/if}
											</div>
										{/each}
									</div>
								{/if}
								{#if sel.nextAttemptAt}
									<div class="mt-2 text-[12px] text-text-4">
										{m.webhooks_next_attempt({ time: fmt.format(sel.nextAttemptAt) })}
									</div>
								{/if}
							</div>
							<div class="min-w-0">
								<div class="mb-1.5 text-[12px] tracking-[0.08em] text-text-4 uppercase">{m.webhooks_payload()}</div>
								<pre
									class="max-h-80 overflow-auto rounded-md border border-border bg-surface p-3 font-mono text-[11.5px] leading-relaxed text-text-2">{JSON.stringify(sel.payload, null, 2)}</pre>
							</div>
						</div>
					{/if}
				</div>
			{/each}
			{#if data.deliveries.hasMore}
				<div class="border-t border-border/40 px-5 py-2.5 text-center">
					<a href={olderHref()} data-sveltekit-noscroll class="text-[13px] text-text-3 hover:text-text">{m.webhooks_load_older()}</a>
				</div>
			{/if}
		{/if}
	</section>
</div>

