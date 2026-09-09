<script lang="ts">
	// The sidebar brand mark doubles as the instance switcher (TRACK-140):
	// click it for a Slack-workspace-style menu of the other trackr
	// deployments this user signs in to. Instances are separate installs; the
	// list is a per-user preference on each one. Picking an instance is a plain
	// navigation to that host (its own cookie keeps you signed in) carrying
	// this origin in the fragment, so the other side can offer to add us.
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Icon from '../Icon.svelte';
	import BrandLogo from '../BrandLogo.svelte';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { clickOutside } from '$lib/actions/clickOutside';
	import Modal from '../Modal.svelte';
	import Button from '../Button.svelte';
	import { brandName } from '$lib/brand';
	import { m } from '$lib/paraglide/messages';
	import { showToast } from '$lib/stores/toast.svelte';
	import { confirm } from '../confirm.svelte';
	import { invalidateAll } from '$app/navigation';
	import { instanceHost, normalizeInstanceUrl, sameInstance, switchUrl } from '$lib/instances';
	import { takePendingHandoff } from '$lib/instances-handoff';
	import { probeInstance as probe, saveInstance } from '$lib/instances-client';

	type Instance = { url: string; name: string; logoUrl: string | null };
	type OrgOption = { id: string; name: string; color: string };

	// `fade` is the rail's label class (opacity only, never removed from flow),
	// so collapsing hides name, host and chevron while the logo holds still.
	// The portal passes its organizations: a client who belongs to several
	// orgs on this instance switches between them in the same tile, above the
	// list of other instances — one control for "where am I".
	let {
		fade = '',
		orgs = [],
		activeOrgId = null,
		onChooseOrg,
		open = $bindable(false)
	}: {
		fade?: string;
		orgs?: OrgOption[];
		activeOrgId?: string | null;
		onChooseOrg?: (orgId: string) => void | Promise<void>;
		// Bindable so the collapsed rail can hold its hover-peek open while the
		// menu is showing.
		open?: boolean;
	} = $props();
	const showOrgs = $derived(orgs.length > 1 && !!onChooseOrg);
	const activeOrg = $derived(orgs.find((o) => o.id === activeOrgId) ?? null);

	function chooseOrg(id: string) {
		close();
		void onChooseOrg?.(id);
	}

	// The list rides in the layout data (user preferences); after a write we
	// reload it so this menu and /me/instances stay in step. An entry for the
	// host we are on is never shown: two dev servers sharing one database
	// (:5173 and :5174) write the same row, so each sees the other's "add me
	// back" entry pointing at itself.
	const stored = $derived(
		(page.data as { preferences?: { instances?: Instance[] } }).preferences?.instances ?? []
	);
	const instances = $derived(stored.filter((i) => !sameInstance(i.url, page.url.origin)));

	// The tile rolls out in place (it grows and pushes the nav down) rather
	// than opening a floating menu, so the whole thing reads as one control.
	function close() {
		open = false;
	}

	let addOpen = $state(false);
	let urlInput = $state('');
	let addError = $state<string | null>(null);
	let busy = $state(false);

	async function save(
		method: 'POST' | 'DELETE',
		body: { url: string; name?: string; logoUrl?: string | null }
	): Promise<boolean> {
		const list = await saveInstance(method, body);
		if (!list) return false;
		await invalidateAll();
		return true;
	}

	function openAdd() {
		close();
		urlInput = '';
		addError = null;
		addOpen = true;
	}

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
			const info = await probe(target);
			if (!info) {
				addError = m.instances_err_not_trackr({ host: instanceHost(target) });
				return;
			}
			if (!(await save('POST', { url: target, ...info }))) {
				addError = m.instances_err_save();
				return;
			}
			showToast('ok', m.instances_added({ name: info.name }));
			addOpen = false;
		} finally {
			busy = false;
		}
	}

	async function remove(inst: Instance, e: MouseEvent) {
		e.stopPropagation();
		const ok = await confirm({
			title: m.instances_remove_title({ name: inst.name }),
			message: m.instances_remove_message({ host: instanceHost(inst.url) }),
			confirmLabel: m.common_remove(),
			cancelLabel: m.common_cancel(),
			tone: 'danger',
			icon: 'trash'
		});
		if (!ok) return;
		if (await save('DELETE', { url: inst.url })) {
			showToast('ok', m.instances_removed({ name: inst.name }));
		} else {
			showToast('err', m.instances_err_save());
		}
	}

	function switchTo(inst: Instance) {
		close();
		window.location.assign(switchUrl(inst.url, page.url.origin));
	}

	// Arrival from another instance: validate, probe, then ASK — never merge
	// silently, because anyone can craft a link with a fragment. The dialog
	// shows the real hostname so a lookalike stays visible.
	onMount(() => {
		const source = takePendingHandoff();
		if (!source) return;
		if (sameInstance(source, page.url.origin)) return;
		if (instances.some((i) => sameInstance(i.url, source))) return;
		void (async () => {
			const info = await probe(source);
			if (!info) return;
			const ok = await confirm({
				title: m.instances_handoff_title({ name: info.name }),
				message: m.instances_handoff_message({ host: instanceHost(source) }),
				confirmLabel: m.instances_add(),
				cancelLabel: m.common_cancel(),
				icon: 'link'
			});
			if (!ok) return;
			if (await save('POST', { url: source, ...info })) {
				showToast('ok', m.instances_added({ name: info.name }));
			} else {
				showToast('err', m.instances_err_save());
			}
		})();
	});
</script>

<!--
	The wrapper reserves the closed tile's height plus its margins (12 + 48 + 10
	px) and the card is absolutely positioned inside it, so rolling out overlays
	the nav instead of pushing it down. The button holds that height itself
	(min-h 46 + border = 48, square in the 48px folded column) so the tile
	stays put whether the second line — the active organization, portal only —
	is there or not. The host is not shown in the header; the menu lists it where
	instances need telling apart.
-->
<div class="relative z-20 h-[70px]">
	<div
		use:clickOutside={close}
		class="absolute inset-x-2 top-3 overflow-hidden rounded-[10px] border transition-[background-color,border-color,box-shadow] duration-150 {open
			? 'border-border-strong bg-surface-2 shadow-lg'
			: 'border-border bg-surface hover:border-border-strong hover:bg-surface-2'}"
	>
		<button
			type="button"
			onclick={() => (open = !open)}
			aria-expanded={open}
			class="group flex min-h-[46px] w-full items-center gap-2.5 px-3 py-2 text-left"
		>
			<span class="grid h-6 w-6 shrink-0 place-items-center" aria-hidden="true">
				<BrandLogo size={22} />
			</span>
			<span class="min-w-0 flex-1 {fade}">
				<span
					class="block truncate text-[15px] leading-5 font-semibold tracking-[-0.01em] text-text"
				>
					{brandName()}
				</span>
				{#if showOrgs && activeOrg}
					<span class="flex items-center gap-1.5 text-[12px] leading-[14px] text-text-3">
						<span class="h-1.5 w-1.5 shrink-0 rounded-full" style:background={activeOrg.color}
						></span>
						<span class="truncate">{activeOrg.name}</span>
					</span>
				{/if}
			</span>
			<span
				class="shrink-0 transition-colors group-hover:text-text {fade} {open
					? 'text-text'
					: 'text-text-3'}"
				aria-hidden="true"
			>
				<Icon name="chevrons-vertical" size={14} />
			</span>
		</button>

		{#if open}
			<div transition:slide={{ duration: 180, easing: cubicOut }}>
				{#if showOrgs}
					<div class="mx-3 border-t border-border"></div>
					<div class="py-1">
						<div class="px-3 pt-1.5 pb-1 text-[12px] text-text-4 {fade}">
							{m.shell_switch_organization()}
						</div>
						{#each orgs as o (o.id)}
							<button
								type="button"
								onclick={() => chooseOrg(o.id)}
								class="flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-[var(--row-hover)]"
							>
								<span
									class="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[12px] font-semibold text-white"
									style:background={o.color}
								>
									{o.name.slice(0, 1).toUpperCase()}
								</span>
								<span
									class="min-w-0 flex-1 truncate text-[14px] leading-5 font-medium text-text-2 {fade}"
								>
									{o.name}
								</span>
								<span
									class="shrink-0 text-accent {o.id === activeOrgId
										? 'opacity-100'
										: 'opacity-0'} {fade}"
								>
									<Icon name="check" size={14} />
								</span>
							</button>
						{/each}
					</div>
				{/if}
				<div class="mx-3 border-t border-border"></div>
				<div class="py-1">
					{#each instances as inst (inst.url)}
						<div class="group/row flex items-center transition-colors hover:bg-[var(--row-hover)]">
							<button
								type="button"
								onclick={() => switchTo(inst)}
								title="{m.instances_switch_to({ name: inst.name })} ({instanceHost(inst.url)})"
								class="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-1.5 text-left"
							>
								<span class="grid h-6 w-6 shrink-0 place-items-center">
									{#if inst.logoUrl}
										<img
											src={inst.logoUrl}
											alt=""
											width="20"
											height="20"
											class="h-5 w-5 object-contain"
											draggable="false"
										/>
									{:else}
										<Icon name="org" size={16} class="text-text-3" />
									{/if}
								</span>
								<span
									class="min-w-0 flex-1 truncate text-[14px] leading-5 font-medium text-text-2 {fade}"
								>
									{inst.name}
								</span>
							</button>
							<button
								type="button"
								onclick={(e) => remove(inst, e)}
								aria-label={m.instances_remove({ name: inst.name })}
								title={m.instances_remove({ name: inst.name })}
								class="mr-[7px] grid h-7 w-7 shrink-0 place-items-center rounded-md text-text-4 opacity-0 transition-opacity group-hover/row:opacity-100 hover:bg-surface hover:text-text focus-visible:opacity-100 {fade}"
							>
								<Icon name="x" size={13} />
							</button>
						</div>
					{/each}

					<button
						type="button"
						onclick={openAdd}
						class="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[14px] text-text-2 transition-colors hover:bg-[var(--row-hover)] hover:text-text"
					>
						<span class="grid h-6 w-6 shrink-0 place-items-center">
							<Icon name="plus" size={15} class="text-text-3" />
						</span>
						<span class="truncate {fade}">{m.instances_add()}</span>
					</button>
				</div>
			</div>
		{/if}
	</div>
</div>

<Modal open={addOpen} onclose={() => (addOpen = false)} maxWidth={440}>
	<form onsubmit={submitAdd}>
		<div class="flex items-center border-b border-border px-5 pt-4 pb-3">
			<div class="text-[15px] font-semibold">{m.instances_add_title()}</div>
			<button
				type="button"
				onclick={() => (addOpen = false)}
				aria-label={m.common_close()}
				class="ml-auto grid h-8 w-8 place-items-center rounded-lg text-text-3 transition-colors hover:bg-surface hover:text-text"
			>
				<Icon name="x" size={15} />
			</button>
		</div>
		<div class="px-5 pt-5 pb-3">
			<label class="block">
				<span class="mb-2 block text-[12px] tracking-[0.08em] text-text-4 uppercase">
					{m.instances_url_label()}
				</span>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					type="text"
					bind:value={urlInput}
					placeholder={m.instances_url_placeholder()}
					autocomplete="off"
					autocapitalize="off"
					spellcheck="false"
					autofocus
					disabled={busy}
					class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-[14px] text-text transition-colors outline-none focus:border-accent"
				/>
			</label>
			<p class="mt-2 text-[13px] leading-snug text-text-3">{m.instances_add_hint()}</p>
			{#if addError}
				<p class="mt-2 text-[13px] text-[#ef4f5e]">{addError}</p>
			{/if}
		</div>
		<div class="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
			<Button variant="ghost" onclick={() => (addOpen = false)} disabled={busy}>
				{m.common_cancel()}
			</Button>
			<Button variant="primary" type="submit" disabled={busy || !urlInput.trim()}>
				{busy ? m.instances_checking() : m.instances_add()}
			</Button>
		</div>
	</form>
</Modal>
