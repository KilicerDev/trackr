<script lang="ts">
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { ActionResult } from '@sveltejs/kit';
	import { showToast } from '$lib/stores/toast.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import { confirm as uiConfirm } from '$lib/components/confirm.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const cols = '1.8fr 1.2fr 0.8fr 0.9fr 1.2fr 1.2fr 0.6fr';

	const PLATFORM_LABEL: Record<string, string> = {
		ios: 'iOS',
		android: 'Android',
		'ios-live-activity': 'iOS Live Activity'
	};

	// Same person on several rows (multiple devices) or the same device having
	// moved between accounts both show up here — the count makes that obvious.
	const countByUser = $derived(
		data.devices.reduce<Record<string, number>>((acc, d) => {
			acc[d.user.id] = (acc[d.user.id] ?? 0) + 1;
			return acc;
		}, {})
	);

	let removing = $state<string | null>(null);

	async function removeDevice(d: PageData['devices'][number]) {
		const ok = await uiConfirm({
			title: m.devices_remove_title(),
			message: m.devices_remove_message({
				device: d.deviceName ?? m.devices_unknown_device(),
				user: d.user.name
			}),
			confirmLabel: m.common_remove(),
			tone: 'danger'
		});
		if (!ok) return;
		removing = d.id;
		const fd = new FormData();
		fd.append('id', d.id);
		try {
			const res = await fetch('?/remove', {
				method: 'POST',
				body: fd,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result: ActionResult = deserialize(await res.text());
			if (result.type === 'success') await invalidateAll();
			else showToast('err', m.devices_action_error());
		} catch {
			showToast('err', m.devices_action_error());
		} finally {
			removing = null;
		}
	}
</script>

<svelte:head><title>{m.system_tab_devices()} · {m.system_title()}</title></svelte:head>

<div class="mb-6">
	<h1 class="text-[26px] font-semibold tracking-[-0.014em]">{m.devices_title()}</h1>
	<p class="mt-1 max-w-xl text-[14px] text-text-3">{m.devices_description()}</p>
</div>

<div class="overflow-hidden rounded-2xl border border-border bg-bg-elev">
	{#if data.devices.length === 0}
		<EmptyState icon="bell" title={m.devices_empty_title()} hint={m.devices_empty_description()} />
	{:else}
		<div
			class="grid h-9 items-center gap-3 border-b border-border px-5 text-[12px] tracking-[0.08em] text-text-4 uppercase"
			style:grid-template-columns={cols}
		>
			<span>{m.devices_col_user()}</span>
			<span>{m.devices_col_device()}</span>
			<span>{m.devices_col_platform()}</span>
			<span>{m.devices_col_token()}</span>
			<span>{m.devices_col_registered()}</span>
			<span>{m.devices_col_last_seen()}</span>
			<span class="text-right">{m.schedules_col_actions()}</span>
		</div>
		{#each data.devices as d (d.id)}
			<div
				class="grid items-center gap-3 border-b border-border/40 px-5 py-2.5 text-[14px] last:border-b-0"
				style:grid-template-columns={cols}
			>
				<div class="flex min-w-0 items-center gap-2.5">
					<Avatar user={d.user} size={28} />
					<span class="min-w-0">
						<span class="flex items-center gap-1.5">
							<span class="truncate font-medium text-text">{d.user.name}</span>
							{#if (countByUser[d.user.id] ?? 0) > 1}
								<span class="rounded bg-surface px-1.5 font-mono text-[11px] text-text-3"
									>×{countByUser[d.user.id]}</span
								>
							{/if}
						</span>
						<span class="block truncate font-mono text-[12px] text-text-3">{d.user.email}</span>
					</span>
				</div>
				<div class="truncate text-text-2">{d.deviceName ?? m.devices_unknown_device()}</div>
				<div class="text-text-3">{PLATFORM_LABEL[d.platform] ?? d.platform}</div>
				<div class="font-mono text-[13px] text-text-3">{d.tokenPrefix}…</div>
				<div class="font-mono text-[13px] text-text-3">{d.createdAt}</div>
				<div class="font-mono text-[13px] text-text-3">{d.lastSeenAt}</div>
				<div class="text-right">
					<button
						type="button"
						onclick={() => removeDevice(d)}
						disabled={removing === d.id}
						class="inline-flex h-7 cursor-pointer items-center rounded-md border border-border bg-surface px-2.5 text-[13px] text-text-2 transition-colors hover:text-text disabled:opacity-50"
					>
						{m.common_remove()}
					</button>
				</div>
			</div>
		{/each}
	{/if}
</div>
