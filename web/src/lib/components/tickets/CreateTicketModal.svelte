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
	import AttachmentDropzone from '../attachments/AttachmentDropzone.svelte';
	import StagedFileList from '../attachments/StagedFileList.svelte';
	import { selectStageable } from '$lib/config/attachments';
	import { m } from '$lib/paraglide/messages';
	import { priorityLabel, ticketCategoryLabel } from '$lib/utils/labels';

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
	let fileInput = $state<HTMLInputElement>();
	let stagedFiles = $state<File[]>([]);
	let pop = $state<'org' | 'priority' | 'category' | null>(null);

	function addFiles(incoming: File[]) {
		const { accepted, errors } = selectStageable(incoming, stagedFiles.length);
		for (const err of errors) showToast('err', err);
		if (accepted.length) stagedFiles = [...stagedFiles, ...accepted];
	}

	function onPick(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		if (target.files?.length) addFiles(Array.from(target.files));
		target.value = '';
	}

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
			stagedFiles = [];
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
		enctype="multipart/form-data"
		use:enhance={({ formData }) => {
			// Staged files ride along with the form; the create action attaches
			// them to the new ticket after it exists.
			for (const file of stagedFiles) formData.append('attachments', file);
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
						(result.data as { message?: string } | undefined)?.message ?? m.tickets_create_failed();
					showToast('err', msg);
				} else if (result.type === 'error') {
					showToast('err', result.error?.message ?? m.tickets_create_failed());
				}
			};
		}}
	>
		<AttachmentDropzone
			onfiles={addFiles}
			disabled={submitting}
			label={m.tickets_dropzone_create()}
		>
			<div class="flex items-center border-b border-border px-5 pt-4 pb-3">
				<div>
					<div class="text-[11px] tracking-[0.08em] text-text-4 uppercase">
						{m.tickets_support_eyebrow()}
					</div>
					<div class="text-[15px] font-semibold">{m.tickets_new_title()}</div>
				</div>
				<button
					type="button"
					onclick={onclose}
					aria-label={m.common_close()}
					class="ml-auto grid h-8 w-8 place-items-center rounded-lg text-text-3 transition-colors hover:bg-surface hover:text-text"
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
					placeholder={m.tickets_subject_placeholder()}
					class="mb-3 block w-full border-0 bg-transparent text-[19px] font-semibold tracking-[-0.01em] text-text outline-none placeholder:text-text-3"
				/>

				<textarea
					name="description"
					bind:value={description}
					placeholder={m.tickets_description_placeholder()}
					rows="4"
					class="mb-4 w-full resize-none border-0 bg-transparent text-[13.5px] leading-relaxed text-text-2 outline-none placeholder:text-text-3"
				></textarea>

				<div class="flex flex-wrap gap-2">
					<!-- Org picker -->
					<div class="relative">
						<button
							type="button"
							disabled={!!lockedOrgId}
							onclick={() => (pop = pop === 'org' ? null : 'org')}
							class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12.5px] transition-colors hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-70"
						>
							{#if selectedOrg}
								<span class="h-2 w-2 rounded-full" style:background={selectedOrg.color}></span>
								<span>{selectedOrg.name}</span>
							{:else}
								<Icon name="org" size={13} class="text-text-3" />
								<span>{m.tickets_select_org_placeholder()}</span>
							{/if}
							{#if !lockedOrgId}<Icon name="chevron" size={11} class="text-text-3" />{/if}
						</button>
						{#if pop === 'org'}
							<div
								use:clickOutside={() => (pop = null)}
								in:fly={POPOVER_IN}
								class="absolute top-full z-50 mt-1.5 min-w-[220px] rounded-[10px] border border-border bg-bg-elev p-1.5"
								style:box-shadow="var(--shadow-lg)"
							>
								{#each orgs as o (o.id)}
									<button
										type="button"
										onclick={() => {
											orgId = o.id;
											pop = null;
										}}
										class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
									>
										<span class="h-2 w-2 rounded-full" style:background={o.color}></span>
										<span class="truncate text-[13px]">{o.name}</span>
										<span
											class="ml-auto text-accent {orgId === o.id ? 'opacity-100' : 'opacity-0'}"
										>
											<Icon name="check" size={13} />
										</span>
									</button>
								{/each}
								{#if orgs.length === 0}
									<div class="px-2 py-2 text-[11.5px] text-text-3">
										{m.tickets_no_orgs_available()}
									</div>
								{/if}
							</div>
						{/if}
					</div>

					<!-- Priority picker -->
					<div class="relative">
						<button
							type="button"
							onclick={() => (pop = pop === 'priority' ? null : 'priority')}
							class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12.5px] transition-colors hover:border-border-strong"
						>
							<PriorityBars {priority} />
							<span>{priorityLabel(priority)}</span>
							<Icon name="chevron" size={11} class="text-text-3" />
						</button>
						{#if pop === 'priority'}
							<div
								use:clickOutside={() => (pop = null)}
								in:fly={POPOVER_IN}
								class="absolute top-full z-50 mt-1.5 min-w-[160px] rounded-[10px] border border-border bg-bg-elev p-1.5"
								style:box-shadow="var(--shadow-lg)"
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
										<span class="text-[13px]">{priorityLabel(p.id)}</span>
										<span
											class="ml-auto text-accent {priority === p.id ? 'opacity-100' : 'opacity-0'}"
										>
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
							class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12.5px] transition-colors hover:border-border-strong"
						>
							<span class="h-2 w-2 rounded-full" style:background={categoryMeta.color}></span>
							<span>{ticketCategoryLabel(category)}</span>
							<Icon name="chevron" size={11} class="text-text-3" />
						</button>
						{#if pop === 'category'}
							<div
								use:clickOutside={() => (pop = null)}
								in:fly={POPOVER_IN}
								class="absolute top-full z-50 mt-1.5 min-w-[180px] rounded-[10px] border border-border bg-bg-elev p-1.5"
								style:box-shadow="var(--shadow-lg)"
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
										<span class="text-[13px]">{ticketCategoryLabel(c.id)}</span>
										<span
											class="ml-auto text-accent {category === c.id ? 'opacity-100' : 'opacity-0'}"
										>
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

				<!-- Attachments -->
				<div class="mt-4 space-y-2">
					{#if stagedFiles.length}
						<StagedFileList
							files={stagedFiles}
							disabled={submitting}
							onremove={(i) => (stagedFiles = stagedFiles.filter((_, idx) => idx !== i))}
						/>
					{/if}
					<button
						type="button"
						onclick={() => fileInput?.click()}
						class="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-[12.5px] text-text-3 transition-colors hover:border-border-strong hover:text-text"
					>
						<Icon name="paperclip" size={13} />
						<span>{m.tickets_attach_files()}</span>
					</button>
					<input bind:this={fileInput} type="file" multiple hidden onchange={onPick} />
				</div>
			</div>

			<div class="flex items-center gap-2 rounded-b-2xl border-t border-border bg-bg/40 px-5 py-3">
				<span class="text-[11.5px] text-text-3">
					<Kbd>⌘↵</Kbd>
					{m.tickets_kbd_to_create()}
				</span>
				<div class="ml-auto flex items-center gap-2">
					<Button variant="default" onclick={onclose}>{m.common_cancel()}</Button>
					<button
						type="submit"
						disabled={submitting || !subject.trim() || !orgId}
						class="inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-accent px-[11px] py-[7px] text-[13px] font-medium text-white shadow-btn transition-[background,border-color,transform] duration-150 hover:bg-accent-strong active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50"
					>
						{submitting ? m.common_creating() : m.tickets_create()}
					</button>
				</div>
			</div>
		</AttachmentDropzone>
	</form>
</Modal>
