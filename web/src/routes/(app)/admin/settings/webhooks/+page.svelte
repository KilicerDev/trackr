<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import CreateWebhookModal from '$lib/components/admin/CreateWebhookModal.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let createOpen = $state(false);

	const cols = '2.2fr 0.9fr 1fr 1.4fr 0.7fr';
	const fmt = new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' });

	type Sub = PageData['subscriptions'][number];
	function statusOf(s: Sub): { label: string; dot: string } {
		if (s.enabled) return { label: m.webhooks_status_active(), dot: 'bg-emerald-400' };
		if (s.disabledReason === 'failures')
			return { label: m.webhooks_status_auto_disabled(), dot: 'bg-[#ef7a6d]' };
		return { label: m.webhooks_status_disabled(), dot: 'bg-text-4' };
	}
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
</script>

<svelte:head><title>{m.settings_tab_webhooks()} · {m.admin_settings_title()}</title></svelte:head>

<div class="mb-6 flex items-start gap-4">
	<div class="min-w-0 flex-1">
		<h1 class="text-[26px] font-semibold tracking-[-0.014em]">{m.webhooks_title()}</h1>
		<p class="mt-1 max-w-xl text-[14px] text-text-3">{m.webhooks_description()}</p>
	</div>
	<Button variant="primary" onclick={() => (createOpen = true)}>
		<Icon name="plus" size={14} />
		{m.webhooks_new()}
	</Button>
</div>

<div class="overflow-hidden rounded-2xl border border-border bg-bg-elev">
	{#if data.subscriptions.length === 0}
		<EmptyState icon="link" title={m.webhooks_empty_title()} hint={m.webhooks_empty_hint()} />
	{:else}
		<div
			class="grid h-9 items-center gap-3 border-b border-border px-5 text-[12px] tracking-[0.08em] text-text-4 uppercase"
			style:grid-template-columns={cols}
		>
			<span>{m.webhooks_col_endpoint()}</span>
			<span>{m.webhooks_col_events()}</span>
			<span>{m.webhooks_col_status()}</span>
			<span>{m.webhooks_col_last_delivery()}</span>
			<span class="text-right">{m.webhooks_col_24h()}</span>
		</div>
		{#each data.subscriptions as s (s.id)}
			{@const st = statusOf(s)}
			<a
				href="/admin/settings/webhooks/{s.id}"
				class="grid items-center gap-3 border-b border-border/40 px-5 py-2.5 text-[14px] transition-colors last:border-b-0 hover:bg-surface/60"
				style:grid-template-columns={cols}
			>
				<div class="min-w-0">
					<span class="block truncate font-medium text-text">{s.name}</span>
					<span class="block truncate font-mono text-[12px] text-text-4">{s.url}</span>
				</div>
				<div class="text-text-3">{m.webhooks_events_count({ count: s.eventTypes.length })}</div>
				<div class="flex items-center gap-2">
					<span class="h-2 w-2 rounded-full {st.dot}"></span>
					<span class="text-text-2">{st.label}</span>
				</div>
				<div class="min-w-0">
					{#if s.lastDelivery}
						<span class="flex items-center gap-2">
							<span class="h-2 w-2 shrink-0 rounded-full {deliveryDot[s.lastDelivery.status]}"></span>
							<span class="text-text-2">{deliveryLabel(s.lastDelivery.status)}</span>
							<span class="truncate font-mono text-[12px] text-text-4">{fmt.format(s.lastDelivery.at)}</span>
						</span>
					{:else}
						<span class="text-text-4">{m.webhooks_never()}</span>
					{/if}
				</div>
				<div class="text-right font-mono text-text-3">{s.deliveryCount24h}</div>
			</a>
		{/each}
	{/if}
</div>

<CreateWebhookModal
	open={createOpen}
	onclose={() => {
		createOpen = false;
	}}
	options={data.options}
/>

