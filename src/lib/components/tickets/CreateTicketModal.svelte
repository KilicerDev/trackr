<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { showToast } from '$lib/toast.svelte';
	import type { ActionResult } from '@sveltejs/kit';
	import Modal from '../Modal.svelte';
	import Icon from '../Icon.svelte';
	import Button from '../Button.svelte';
	import Kbd from '../Kbd.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/motion';
	import { TICKET_CATEGORIES, TICKET_PRIORITIES } from '$lib/data';

	type OrgOption = { id: string; name: string; slug: string; color: string };

	interface Props {
		open: boolean;
		onclose: () => void;
		orgs?: OrgOption[];
		// Restrict the org picker to a specific org and lock it (used for
		// client-role users who can only file against their own org).
		lockedOrgId?: string | null;
	}

	let { open, onclose, orgs = [], lockedOrgId = null }: Props = $props();

	type Priority = (typeof TICKET_PRIORITIES)[number]['id'];
	type Category = (typeof TICKET_CATEGORIES)[number]['id'];

	let subject = $state('');
	let description = $state('');
	let orgId = $state<string>('');
	let priority = $state<Priority>('medium');
	let category = $state<Category>('general');
	let submitting = $state(false);

	let formEl = $state<HTMLFormElement>();
	let pop = $state<'org' | 'priority' | 'category' | null>(null);

	const selectedOrg = $derived(orgs.find((o) => o.id === orgId));
	const priorityMeta = $derived(TICKET_PRIORITIES.find((p) => p.id === priority)!);
	const categoryMeta = $derived(TICKET_CATEGORIES.find((c) => c.id === category)!);

	$effect(() => {
		if (open) {
			subject = '';
			description = '';
			orgId = lockedOrgId ?? orgs[0]?.id ?? '';
			priority = 'medium';
			category = 'general';
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
		action="/tickets?/create"
		use:enhance={() => {
			submitting = true;
			return async ({ result }: { result: ActionResult }) => {
				submitting = false;
				if (result.type === 'success') {
					const data = result.data as { displayId?: string } | undefined;
					showToast('ok', `Ticket ${data?.displayId ?? ''} created`);
					await invalidateAll();
					onclose();
				} else if (result.type === 'failure') {
					const msg = (result.data as { message?: string } | undefined)?.message ?? 'Failed to create ticket.';
					showToast('err', msg);
				} else if (result.type === 'error') {
					showToast('err', result.error?.message ?? 'Failed to create ticket.');
				}
			};
		}}
	>
		<div class="flex items-center px-5 pt-4 pb-3 border-b border-border">
			<div>
				<div class="text-[11px] uppercase tracking-[0.08em] text-text-4">Support</div>
				<div class="text-[15px] font-semibold">New ticket</div>
			</div>
			<button
				type="button"
				onclick={onclose}
				aria-label="Close"
				class="ml-auto w-8 h-8 grid place-items-center rounded-lg text-text-3 hover:text-text hover:bg-surface transition-colors"
			>
				<Icon name="x" size={14} />
			</button>
		</div>

		<div class="px-5 pt-5 pb-3">
			<input
				type="text"
				name="subject"
				bind:value={subject}
				required
				placeholder="Subject…"
				class="block w-full bg-transparent border-0 outline-none text-[19px] font-semibold tracking-[-0.01em] text-text placeholder:text-text-3 mb-3"
			/>

			<textarea
				name="description"
				bind:value={description}
				placeholder="Describe the issue or request…"
				rows="4"
				class="w-full resize-none bg-transparent border-0 outline-none text-[13.5px] leading-relaxed text-text-2 placeholder:text-text-3 mb-4"
			></textarea>

			<div class="flex flex-wrap gap-2">
				<!-- Org picker -->
				<div class="relative">
					<button
						type="button"
						disabled={!!lockedOrgId}
						onclick={() => (pop = pop === 'org' ? null : 'org')}
						class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-border hover:border-border-strong disabled:opacity-70 disabled:cursor-not-allowed text-[12.5px] transition-colors"
					>
						{#if selectedOrg}
							<span class="w-2 h-2 rounded-full" style:background={selectedOrg.color}></span>
							<span>{selectedOrg.name}</span>
						{:else}
							<Icon name="org" size={13} class="text-text-3" />
							<span>Select org…</span>
						{/if}
						{#if !lockedOrgId}<Icon name="chevron" size={11} class="text-text-3" />{/if}
					</button>
					{#if pop === 'org'}
						<div
							use:clickOutside={() => (pop = null)}
							in:fly={POPOVER_IN}
							class="absolute top-full mt-1.5 z-50 bg-bg-elev border border-border rounded-[10px] p-1.5 min-w-[220px]"
							style:box-shadow="var(--shadow-lg)"
						>
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
									<span class="ml-auto text-accent {orgId === o.id ? 'opacity-100' : 'opacity-0'}">
										<Icon name="check" size={13} />
									</span>
								</button>
							{/each}
							{#if orgs.length === 0}
								<div class="px-2 py-2 text-[11.5px] text-text-3">No organizations available.</div>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Priority picker -->
				<div class="relative">
					<button
						type="button"
						onclick={() => (pop = pop === 'priority' ? null : 'priority')}
						class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-border hover:border-border-strong text-[12.5px] transition-colors"
					>
						<PriorityBars priority={priority} />
						<span>{priorityMeta.label}</span>
						<Icon name="chevron" size={11} class="text-text-3" />
					</button>
					{#if pop === 'priority'}
						<div
							use:clickOutside={() => (pop = null)}
							in:fly={POPOVER_IN}
							class="absolute top-full mt-1.5 z-50 bg-bg-elev border border-border rounded-[10px] p-1.5 min-w-[160px]"
							style:box-shadow="var(--shadow-lg)"
						>
							{#each TICKET_PRIORITIES as p (p.id)}
								<button
									type="button"
									onclick={() => {
										priority = p.id as Priority;
										pop = null;
									}}
									class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text"
								>
									<PriorityBars priority={p.id} />
									<span class="text-[13px]">{p.label}</span>
									<span class="ml-auto text-accent {priority === p.id ? 'opacity-100' : 'opacity-0'}">
										<Icon name="check" size={13} />
									</span>
								</button>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Category picker -->
				<div class="relative">
					<button
						type="button"
						onclick={() => (pop = pop === 'category' ? null : 'category')}
						class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-border hover:border-border-strong text-[12.5px] transition-colors"
					>
						<span class="w-2 h-2 rounded-full" style:background={categoryMeta.color}></span>
						<span>{categoryMeta.label}</span>
						<Icon name="chevron" size={11} class="text-text-3" />
					</button>
					{#if pop === 'category'}
						<div
							use:clickOutside={() => (pop = null)}
							in:fly={POPOVER_IN}
							class="absolute top-full mt-1.5 z-50 bg-bg-elev border border-border rounded-[10px] p-1.5 min-w-[180px]"
							style:box-shadow="var(--shadow-lg)"
						>
							{#each TICKET_CATEGORIES as c (c.id)}
								<button
									type="button"
									onclick={() => {
										category = c.id as Category;
										pop = null;
									}}
									class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text"
								>
									<span class="w-2 h-2 rounded-full" style:background={c.color}></span>
									<span class="text-[13px]">{c.label}</span>
									<span class="ml-auto text-accent {category === c.id ? 'opacity-100' : 'opacity-0'}">
										<Icon name="check" size={13} />
									</span>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<input type="hidden" name="orgId" value={orgId} />
			<input type="hidden" name="priority" value={priority} />
			<input type="hidden" name="category" value={category} />
			<input type="hidden" name="channel" value="web_form" />
		</div>

		<div class="flex items-center gap-2 px-5 py-3 border-t border-border bg-bg/40 rounded-b-2xl">
			<span class="text-[11.5px] text-text-3">
				<Kbd>⌘↵</Kbd> to create
			</span>
			<div class="ml-auto flex items-center gap-2">
				<Button variant="default" onclick={onclose}>Cancel</Button>
				<button
					type="submit"
					disabled={submitting || !subject.trim() || !orgId}
					class="inline-flex items-center gap-1.5 rounded-lg font-medium text-[13px] transition-[background,border-color,transform] duration-150 disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-[1px] px-[11px] py-[7px] bg-accent text-white border border-transparent hover:bg-accent-strong shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_4px_12px_rgba(239,122,109,0.25)]"
				>
					{submitting ? 'Creating…' : 'Create ticket'}
				</button>
			</div>
		</div>
	</form>
</Modal>
