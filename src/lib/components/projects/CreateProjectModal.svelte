<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { showToast } from '$lib/toast.svelte';
	import type { ActionResult } from '@sveltejs/kit';
	import Modal from '../Modal.svelte';
	import Icon from '../Icon.svelte';
	import Button from '../Button.svelte';
	import Kbd from '../Kbd.svelte';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/motion';
	import { PROJECT_STATUS } from '$lib/data';
	import { projectStatusLabel } from '$lib/labels';
	import { m } from '$lib/paraglide/messages';
	import type { Project } from '$lib/types';

	type OrgOption = { id: string; name: string; slug: string; color: string };

	interface Props {
		open: boolean;
		onclose: () => void;
		oncreated?: (name: string) => void;
		onerror?: (msg: string) => void;
		orgs?: OrgOption[];
	}

	let { open, onclose, oncreated, onerror, orgs = [] }: Props = $props();

	const PALETTE = [
		'#ef7a6d',
		'#e07a5f',
		'#f0a85c',
		'#e9c46a',
		'#7fc8a9',
		'#5fb3c2',
		'#7a9cf0',
		'#9b8cf0',
		'#c08bd6',
		'#d97cae'
	];

	const STATUSES: Project['status'][] = [
		'prospect',
		'planned',
		'active',
		'paused',
		'completed',
		'cancelled'
	];

	let name = $state('');
	let key = $state('');
	let keyTouched = $state(false);
	let description = $state('');
	let color = $state(PALETTE[0]);
	let status = $state<Project['status']>('active');
	let orgId = $state<string>(''); // empty string = internal (no org)
	let submitting = $state(false);

	let formEl = $state<HTMLFormElement>();
	let pop = $state<'status' | 'org' | null>(null);

	const statusMeta = $derived(PROJECT_STATUS[status]);
	const selectedOrg = $derived(orgs.find((o) => o.id === orgId));

	const icon = $derived(deriveIcon(name));
	const autoKey = $derived(deriveKey(name));
	const effectiveKey = $derived(keyTouched ? key.toUpperCase() : autoKey);

	function deriveIcon(n: string): string {
		const trimmed = n.trim();
		if (!trimmed) return 'P';
		return trimmed[0].toUpperCase();
	}

	function deriveKey(n: string): string {
		const cleaned = n
			.toUpperCase()
			.replace(/[^A-Z0-9 ]/g, '')
			.trim();
		if (!cleaned) return '';
		const parts = cleaned.split(/\s+/);
		if (parts.length === 1) return parts[0].slice(0, 5);
		return parts
			.map((p) => p[0])
			.join('')
			.slice(0, 5);
	}

	$effect(() => {
		if (open) {
			name = '';
			key = '';
			keyTouched = false;
			description = '';
			color = PALETTE[0];
			status = 'active';
			orgId = '';
			submitting = false;
			pop = null;
		}
	});

	function onKey(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') onclose();
		else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			formEl?.requestSubmit();
		}
	}
</script>

<svelte:window onkeydown={onKey} />

<Modal {open} {onclose} maxWidth={580}>
	<form
		bind:this={formEl}
		method="POST"
		action="/projects?/create"
		use:enhance={() => {
			submitting = true;
			return async ({ result }: { result: ActionResult }) => {
				submitting = false;
				if (result.type === 'success') {
					oncreated?.(name.trim());
					await invalidateAll();
					onclose();
				} else if (result.type === 'failure') {
					const msg = (result.data as { message?: string } | undefined)?.message ?? m.projects_create_failed();
					showToast('err', msg);
					onerror?.(msg);
				} else if (result.type === 'error') {
					const msg = result.error?.message ?? m.projects_create_failed();
					showToast('err', msg);
					onerror?.(msg);
				}
			};
		}}
	>
		<div class="flex items-center px-5 pt-4 pb-3 border-b border-border">
			<div>
				<div class="text-[11px] uppercase tracking-[0.08em] text-text-4">{m.projects_workspace_eyebrow()}</div>
				<div class="text-[15px] font-semibold">{m.projects_create_title()}</div>
			</div>
			<button
				type="button"
				onclick={onclose}
				aria-label={m.common_close()}
				class="ml-auto w-8 h-8 grid place-items-center rounded-lg text-text-3 hover:text-text hover:bg-surface transition-colors"
			>
				<Icon name="x" size={14} />
			</button>
		</div>

		<div class="px-5 pt-5 pb-3">
			<div class="flex items-start gap-3.5 mb-4">
				<span
					class="shrink-0 grid place-items-center text-white font-semibold relative transition-[background] duration-200"
					style:width="48px"
					style:height="48px"
					style:border-radius="13px"
					style:font-size="22px"
					style:background="linear-gradient(140deg, {color}, color-mix(in oklch, {color} 70%, #000) 85%)"
					style:box-shadow="0 1px 0 rgba(255,255,255,0.18) inset, 0 6px 18px {color}33"
				>
					{icon}
				</span>
				<div class="min-w-0 flex-1">
					<input
						type="text"
						name="name"
						bind:value={name}
						required
						placeholder={m.projects_name_placeholder()}
						class="block w-full bg-transparent border-0 outline-none text-[19px] font-semibold tracking-[-0.01em] text-text placeholder:text-text-3"
					/>
					<div class="flex items-center gap-1.5 mt-1">
						<span class="text-[10.5px] uppercase tracking-[0.08em] text-text-4">{m.projects_key_label()}</span>
						<input
							type="text"
							name="key"
							value={effectiveKey}
							oninput={(e) => {
								keyTouched = true;
								key = (e.target as HTMLInputElement).value
									.toUpperCase()
									.replace(/[^A-Z0-9]/g, '')
									.slice(0, 5);
							}}
							maxlength={5}
							placeholder={m.projects_key_placeholder()}
							class="bg-surface border border-border rounded-md px-1.5 py-0.5 font-mono text-[11.5px] text-text outline-none focus:border-border-strong w-[72px] uppercase tracking-[0.04em]"
						/>
						<span class="text-text-4 text-[11.5px]">·</span>
						<span class="text-[11.5px] text-text-3">
							{m.projects_key_prefix_hint_before()}
							<span class="font-mono text-text-2">{effectiveKey || m.projects_key_fallback()}-1</span>
						</span>
					</div>
				</div>
			</div>

			<textarea
				name="description"
				bind:value={description}
				placeholder={m.projects_description_placeholder()}
				rows="2"
				class="w-full resize-none bg-transparent border-0 outline-none text-[13.5px] leading-relaxed text-text-2 placeholder:text-text-3 mb-4"
			></textarea>

			<div class="mb-4">
				<div class="text-[10.5px] uppercase tracking-[0.08em] text-text-4 mb-2">{m.projects_color_label()}</div>
				<div class="flex flex-wrap gap-1.5">
					{#each PALETTE as c (c)}
						<button
							type="button"
							onclick={() => (color = c)}
							aria-label={m.projects_pick_color({ color: c })}
							class="relative w-7 h-7 rounded-lg grid place-items-center transition-transform hover:scale-105 active:scale-95"
							style:background="linear-gradient(140deg, {c}, color-mix(in oklch, {c} 70%, #000) 85%)"
							style:box-shadow={color === c
								? `0 0 0 2px var(--bg-elev), 0 0 0 4px ${c}`
								: '0 1px 0 rgba(255,255,255,0.18) inset'}
						>
							{#if color === c}
								<svg
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill="none"
									stroke="white"
									stroke-width="3"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<polyline points="20 6 9 17 4 12"></polyline>
								</svg>
							{/if}
						</button>
					{/each}
				</div>
			</div>

			<div class="flex flex-wrap gap-2">
				<div class="relative">
					<button
						type="button"
						onclick={() => (pop = pop === 'status' ? null : 'status')}
						class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-border hover:border-border-strong text-[12.5px] transition-colors"
					>
						<span class="w-2 h-2 rounded-full" style:background={statusMeta.color}></span>
						<span>{projectStatusLabel(status)}</span>
						<Icon name="chevron" size={11} class="text-text-3" />
					</button>
					{#if pop === 'status'}
						<div
							use:clickOutside={() => (pop = null)}
							in:fly={POPOVER_IN}
							class="absolute top-full mt-1.5 z-50 bg-bg-elev border border-border rounded-[10px] p-1.5 min-w-[180px]"
							style:box-shadow="var(--shadow-lg)"
						>
							{#each STATUSES as s (s)}
								{@const meta = PROJECT_STATUS[s]}
								<button
									type="button"
									onclick={() => {
										status = s;
										pop = null;
									}}
									class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text"
								>
									<span class="w-2 h-2 rounded-full" style:background={meta.color}></span>
									<span class="text-[13px]">{projectStatusLabel(s)}</span>
									<span
										class="ml-auto text-accent {status === s ? 'opacity-100' : 'opacity-0'}"
									>
										<Icon name="check" size={13} />
									</span>
								</button>
							{/each}
						</div>
					{/if}
				</div>

				<div class="relative">
					<button
						type="button"
						onclick={() => (pop = pop === 'org' ? null : 'org')}
						class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-border hover:border-border-strong text-[12.5px] transition-colors"
					>
						{#if selectedOrg}
							<span class="w-2 h-2 rounded-full" style:background={selectedOrg.color}></span>
							<span>{selectedOrg.name}</span>
						{:else}
							<Icon name="org" size={13} class="text-text-3" />
							<span>{m.projects_internal()}</span>
						{/if}
						<Icon name="chevron" size={11} class="text-text-3" />
					</button>
					{#if pop === 'org'}
						<div
							use:clickOutside={() => (pop = null)}
							in:fly={POPOVER_IN}
							class="absolute top-full mt-1.5 z-50 bg-bg-elev border border-border rounded-[10px] p-1.5 min-w-[220px]"
							style:box-shadow="var(--shadow-lg)"
						>
							<button
								type="button"
								onclick={() => {
									orgId = '';
									pop = null;
								}}
								class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text"
							>
								<Icon name="org" size={13} class="text-text-3" />
								<span class="text-[13px]">{m.projects_internal()}</span>
								<span
									class="ml-auto text-accent {orgId === '' ? 'opacity-100' : 'opacity-0'}"
								>
									<Icon name="check" size={13} />
								</span>
							</button>
							{#each orgs as o (o.id)}
								<button
									type="button"
									onclick={() => {
										orgId = o.id;
										pop = null;
									}}
									class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text"
								>
									<span class="w-2 h-2 rounded-full" style:background={o.color}></span>
									<span class="text-[13px] truncate">{o.name}</span>
									<span
										class="ml-auto text-accent {orgId === o.id ? 'opacity-100' : 'opacity-0'}"
									>
										<Icon name="check" size={13} />
									</span>
								</button>
							{/each}
							{#if orgs.length === 0}
								<div class="px-2 py-2 text-[11.5px] text-text-3">
									{m.projects_no_orgs_hint_before()}
									<a href="/admin/organizations" class="text-accent hover:underline"
										>{m.projects_admin_orgs_link()}</a
									>.
								</div>
							{/if}
						</div>
					{/if}
				</div>
			</div>

			<input type="hidden" name="color" value={color} />
			<input type="hidden" name="icon" value={icon} />
			<input type="hidden" name="status" value={status} />
			<input type="hidden" name="orgId" value={orgId} />


			<p class="text-[11.5px] text-text-3 mt-4">
				{m.projects_create_lead_hint()}
			</p>
		</div>

		<div class="flex items-center gap-2 px-5 py-3 border-t border-border bg-bg/40 rounded-b-2xl">
			<span class="text-[11.5px] text-text-3">
				<Kbd>⌘↵</Kbd> {m.projects_kbd_to_create()}
			</span>
			<div class="ml-auto flex items-center gap-2">
				<Button variant="default" onclick={onclose}>{m.common_cancel()}</Button>
				<button
					type="submit"
					disabled={submitting || !name.trim() || !effectiveKey}
					class="inline-flex items-center gap-1.5 rounded-lg font-medium text-[13px] transition-[background,border-color,transform] duration-150 disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-[1px] px-[11px] py-[7px] bg-accent text-white border border-transparent hover:bg-accent-strong shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_4px_12px_rgba(239,122,109,0.25)]"
				>
					{submitting ? m.common_creating() : m.projects_create_title()}
				</button>
			</div>
		</div>
	</form>
</Modal>
