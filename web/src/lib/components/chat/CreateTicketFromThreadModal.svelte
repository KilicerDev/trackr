<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { showToast } from '$lib/stores/toast.svelte';
	import type { ActionResult } from '@sveltejs/kit';
	import Modal from '../Modal.svelte';
	import Icon from '../Icon.svelte';
	import Button from '../Button.svelte';
	import Kbd from '../Kbd.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/config/motion';
	import { TICKET_CATEGORIES, TICKET_PRIORITIES } from '$lib/config/taxonomy';
	import { m } from '$lib/paraglide/messages';
	import { priorityLabel, ticketCategoryLabel } from '$lib/utils/labels';

	interface Props {
		open: boolean;
		onclose: () => void;
		threadId: string;
		// Prefills the subject; the user can edit it before creating.
		threadTitle: string;
	}

	let { open, onclose, threadId, threadTitle }: Props = $props();

	type Priority = (typeof TICKET_PRIORITIES)[number]['id'];
	type Category = (typeof TICKET_CATEGORIES)[number]['id'];

	let subject = $state('');
	let description = $state('');
	let priority = $state<Priority>('medium');
	let category = $state<Category>('general');
	let submitting = $state(false);

	let formEl = $state<HTMLFormElement>();
	let pop = $state<'priority' | 'category' | null>(null);

	const categoryMeta = $derived(TICKET_CATEGORIES.find((c) => c.id === category)!);

	$effect(() => {
		if (open) {
			subject = threadTitle ?? '';
			description = '';
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

<Modal {open} {onclose} maxWidth={560}>
	<form
		bind:this={formEl}
		method="POST"
		action="/chat?/createTicket"
		use:enhance={() => {
			submitting = true;
			return async ({ result }: { result: ActionResult }) => {
				submitting = false;
				if (result.type === 'success') {
					const data = result.data as { displayId?: string } | undefined;
					showToast('ok', m.tickets_created_toast({ displayId: data?.displayId ?? '' }));
					await invalidateAll();
					onclose();
				} else if (result.type === 'failure') {
					const msg =
						(result.data as { message?: string } | undefined)?.message ??
						m.chat_err_create_ticket_failed();
					showToast('err', msg);
				} else if (result.type === 'error') {
					showToast('err', result.error?.message ?? m.chat_err_create_ticket_failed());
				}
			};
		}}
	>
		<div class="flex items-center border-b border-border px-5 pt-4 pb-3">
			<div>
				<div class="text-[12px] tracking-[0.08em] text-text-4 uppercase">
					{m.chat_create_ticket_eyebrow()}
				</div>
				<div class="text-[15px] font-semibold">{m.chat_create_ticket_title()}</div>
			</div>
			<button
				type="button"
				onclick={onclose}
				aria-label={m.common_close()}
				class="ml-auto grid h-8 w-8 place-items-center rounded-lg text-text-3 transition-colors hover:bg-surface hover:text-text"
			>
				<Icon name="x" size={15} />
			</button>
		</div>

		<div class="px-5 pt-5 pb-3">
			<input
				type="text"
				name="subject"
				bind:value={subject}
				required
				placeholder={m.chat_ticket_subject_placeholder()}
				class="mb-3 block w-full border-0 bg-transparent text-[22px] font-semibold tracking-[-0.01em] text-text outline-none placeholder:text-text-3"
			/>

			<textarea
				name="description"
				bind:value={description}
				placeholder={m.chat_ticket_description_placeholder()}
				rows="4"
				class="mb-4 w-full resize-none border-0 bg-transparent text-[14px] leading-relaxed text-text-2 outline-none placeholder:text-text-3"
			></textarea>

			<div class="flex flex-wrap gap-2">
				<!-- Priority picker -->
				<div class="relative">
					<button
						type="button"
						onclick={() => (pop = pop === 'priority' ? null : 'priority')}
						class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[14px] transition-colors hover:border-border-strong"
					>
						<PriorityBars {priority} />
						<span>{priorityLabel(priority)}</span>
						<Icon name="chevron" size={12} class="text-text-3" />
					</button>
					{#if pop === 'priority'}
						<div
							use:clickOutside={() => (pop = null)}
							in:fly={POPOVER_IN}
							class="absolute top-full z-50 mt-1.5 min-w-[176px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
						>
							{#each TICKET_PRIORITIES as p (p.id)}
								<button
									type="button"
									onclick={() => {
										priority = p.id as Priority;
										pop = null;
									}}
									class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
								>
									<PriorityBars priority={p.id} />
									<span class="text-[14px]">{priorityLabel(p.id)}</span>
									<span
										class="ml-auto text-accent {priority === p.id ? 'opacity-100' : 'opacity-0'}"
									>
										<Icon name="check" size={14} />
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
						class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[14px] transition-colors hover:border-border-strong"
					>
						<span class="h-2 w-2 rounded-full" style:background={categoryMeta.color}></span>
						<span>{ticketCategoryLabel(category)}</span>
						<Icon name="chevron" size={12} class="text-text-3" />
					</button>
					{#if pop === 'category'}
						<div
							use:clickOutside={() => (pop = null)}
							in:fly={POPOVER_IN}
							class="absolute top-full z-50 mt-1.5 min-w-[198px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
						>
							{#each TICKET_CATEGORIES as c (c.id)}
								<button
									type="button"
									onclick={() => {
										category = c.id as Category;
										pop = null;
									}}
									class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
								>
									<span class="h-2 w-2 rounded-full" style:background={c.color}></span>
									<span class="text-[14px]">{ticketCategoryLabel(c.id)}</span>
									<span
										class="ml-auto text-accent {category === c.id ? 'opacity-100' : 'opacity-0'}"
									>
										<Icon name="check" size={14} />
									</span>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<input type="hidden" name="threadId" value={threadId} />
			<input type="hidden" name="priority" value={priority} />
			<input type="hidden" name="category" value={category} />

			<div class="mt-4 flex items-start gap-2 text-[12px] text-text-4">
				<Icon name="ticket" size={14} class="mt-px shrink-0" />
				<span>{m.chat_create_ticket_hint()}</span>
			</div>
		</div>

		<div class="flex items-center gap-2 rounded-b-2xl border-t border-border bg-bg/40 px-5 py-3">
			<span class="text-[12px] text-text-3">
				<Kbd>⌘↵</Kbd>
				{m.tickets_kbd_to_create()}
			</span>
			<div class="ml-auto flex items-center gap-2">
				<Button variant="default" onclick={onclose}>{m.common_cancel()}</Button>
				<button
					type="submit"
					disabled={submitting || !subject.trim()}
					class="inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-accent px-[12px] py-[8px] text-[14px] font-medium text-white shadow-btn transition-[background,border-color,transform] duration-150 hover:bg-accent-strong active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50"
				>
					{submitting ? m.common_creating() : m.chat_ticket_create_action()}
				</button>
			</div>
		</div>
	</form>
</Modal>
