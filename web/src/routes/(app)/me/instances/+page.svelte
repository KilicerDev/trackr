<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { confirm } from '$lib/components/confirm.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import { m } from '$lib/paraglide/messages';
	import { instanceHost, normalizeInstanceUrl, sameInstance, switchUrl } from '$lib/instances';
	import { probeInstance, saveInstance, type InstanceEntry } from '$lib/instances-client';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Hide an entry for this very host (two dev servers on one database).
	const instances = $derived(
		(data.instances as InstanceEntry[]).filter((i) => !sameInstance(i.url, page.url.origin))
	);

	let urlInput = $state('');
	let addError = $state<string | null>(null);
	let busy = $state(false);
	let rowBusy = $state<string | null>(null);

	async function submitAdd(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		addError = null;
		const target = normalizeInstanceUrl(urlInput);
		if (!target) {
			addError = m.instances_err_invalid_url();
			return;
		}
		if (sameInstance(target, page.url.origin)) {
			addError = m.instances_err_self();
			return;
		}
		if (instances.some((i) => sameInstance(i.url, target))) {
			addError = m.instances_err_exists();
			return;
		}
		busy = true;
		try {
			const info = await probeInstance(target);
			if (!info) {
				addError = m.instances_err_not_trackr({ host: instanceHost(target) });
				return;
			}
			if (!(await saveInstance('POST', { url: target, ...info }))) {
				addError = m.instances_err_save();
				return;
			}
			await invalidateAll();
			showToast('ok', m.instances_added({ name: info.name }));
			urlInput = '';
		} finally {
			busy = false;
		}
	}

	// Re-read name and logo from the instance (it may have been rebranded).
	async function refresh(inst: InstanceEntry) {
		if (rowBusy) return;
		rowBusy = inst.url;
		try {
			const info = await probeInstance(inst.url);
			if (!info) {
				showToast('err', m.instances_err_not_trackr({ host: instanceHost(inst.url) }));
				return;
			}
			if (!(await saveInstance('POST', { url: inst.url, ...info }))) {
				showToast('err', m.instances_err_save());
				return;
			}
			await invalidateAll();
			showToast('ok', m.instances_refreshed({ name: info.name }));
		} finally {
			rowBusy = null;
		}
	}

	async function remove(inst: InstanceEntry) {
		const ok = await confirm({
			title: m.instances_remove_title({ name: inst.name }),
			message: m.instances_remove_message({ host: instanceHost(inst.url) }),
			confirmLabel: m.common_remove(),
			cancelLabel: m.common_cancel(),
			tone: 'danger',
			icon: 'trash'
		});
		if (!ok) return;
		if (await saveInstance('DELETE', { url: inst.url })) {
			await invalidateAll();
			showToast('ok', m.instances_removed({ name: inst.name }));
		} else {
			showToast('err', m.instances_err_save());
		}
	}

	function addedOn(iso: string | undefined): string {
		if (!iso) return '';
		return new Date(iso).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}
</script>

<header class="mb-6">
	<h1 class="text-[26px] font-semibold tracking-[-0.014em]">{m.instances_page_title()}</h1>
	<p class="mt-1 text-[14px] text-text-3">{m.instances_page_subtitle()}</p>
</header>

<div class="space-y-5">
	<section class="rounded-2xl border border-border bg-bg-elev p-5">
		<div class="mb-4 text-[12px] tracking-[0.08em] text-text-4 uppercase">
			{m.instances_section_list()}
		</div>
		{#if instances.length === 0}
			<p class="text-[14px] text-text-3">{m.instances_empty()}</p>
		{:else}
			<ul class="divide-y divide-border">
				{#each instances as inst (inst.url)}
					<li class="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
						<span
							class="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-surface"
						>
							{#if inst.logoUrl}
								<img
									src={inst.logoUrl}
									alt=""
									width="24"
									height="24"
									class="h-6 w-6 object-contain"
									draggable="false"
								/>
							{:else}
								<Icon name="org" size={18} class="text-text-3" />
							{/if}
						</span>
						<div class="min-w-0 flex-1">
							<div class="truncate text-[15px] font-medium text-text">{inst.name}</div>
							<div class="mt-0.5 flex flex-wrap items-center gap-x-3 text-[13px] text-text-3">
								<span class="font-mono">{instanceHost(inst.url)}</span>
								{#if inst.addedAt}
									<span>{m.instances_added_on({ date: addedOn(inst.addedAt) })}</span>
								{/if}
							</div>
						</div>
						<div class="flex shrink-0 items-center gap-1">
							<a
								href={switchUrl(inst.url, page.url.origin)}
								class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-text-2 transition-colors hover:bg-surface hover:text-text"
							>
								<Icon name="link" size={13} />
								{m.instances_open()}
							</a>
							<button
								type="button"
								onclick={() => refresh(inst)}
								disabled={rowBusy === inst.url}
								class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-text-2 transition-colors hover:bg-surface hover:text-text disabled:opacity-50"
							>
								<Icon name="refresh" size={13} class={rowBusy === inst.url ? 'animate-spin' : ''} />
								{m.instances_refresh()}
							</button>
							<button
								type="button"
								onclick={() => remove(inst)}
								aria-label={m.instances_remove({ name: inst.name })}
								title={m.instances_remove({ name: inst.name })}
								class="grid h-8 w-8 place-items-center rounded-lg text-text-3 transition-colors hover:bg-surface hover:text-[#ef4f5e]"
							>
								<Icon name="trash" size={14} />
							</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="rounded-2xl border border-border bg-bg-elev p-5">
		<div class="mb-4 text-[12px] tracking-[0.08em] text-text-4 uppercase">
			{m.instances_add()}
		</div>
		<form onsubmit={submitAdd} class="flex flex-col gap-3">
			<div class="grid grid-cols-[120px_1fr] items-center gap-x-4 gap-y-3 text-[14px]">
				<label for="inst-url" class="text-text-3">{m.instances_url_label()}</label>
				<div class="flex gap-2">
					<input
						id="inst-url"
						type="text"
						bind:value={urlInput}
						placeholder={m.instances_url_placeholder()}
						autocomplete="off"
						autocapitalize="off"
						spellcheck="false"
						disabled={busy}
						class="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[13px] outline-none focus:border-border-strong"
					/>
					<Button type="submit" variant="primary" disabled={busy || !urlInput.trim()}>
						{busy ? m.instances_checking() : m.instances_add()}
					</Button>
				</div>
				<div></div>
				<p class="text-[13px] leading-snug text-text-3">{m.instances_add_hint()}</p>
				{#if addError}
					<div></div>
					<p class="text-[13px] text-[#ef4f5e]">{addError}</p>
				{/if}
			</div>
		</form>
	</section>
</div>
