<script lang="ts">
	const FOOT_BUTTON =
		'inline-flex h-9 items-center justify-center rounded-lg border px-4 text-[14px] leading-none font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { ActionResult } from '@sveltejs/kit';
	import MobileMenuButton from '$lib/components/shell/MobileMenuButton.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import RichTextInput from '$lib/components/RichTextInput.svelte';
	import PriorityBars from '$lib/components/PriorityBars.svelte';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/config/motion';
	import { TICKET_CATEGORIES, TICKET_PRIORITIES } from '$lib/config/taxonomy';
	import { showToast } from '$lib/stores/toast.svelte';
	import AttachmentDropzone from '$lib/components/attachments/AttachmentDropzone.svelte';
	import StagedFileList from '$lib/components/attachments/StagedFileList.svelte';
	import { selectStageable } from '$lib/config/attachments';
	import { m } from '$lib/paraglide/messages';
	import { priorityLabel, ticketCategoryLabel } from '$lib/utils/labels';

	type Priority = (typeof TICKET_PRIORITIES)[number]['id'];
	type Category = (typeof TICKET_CATEGORIES)[number]['id'];

	let { data }: { data: { org: { id: string; name: string; color: string } } } = $props();

	let subject = $state('');
	let description = $state('');
	let priority = $state<Priority>('medium');
	let category = $state<Category>('general');
	let submitting = $state(false);
	let pop = $state<'priority' | 'category' | null>(null);

	let formEl = $state<HTMLFormElement>();
	let fileInput = $state<HTMLInputElement>();
	let stagedFiles = $state<File[]>([]);

	const categoryMeta = $derived(TICKET_CATEGORIES.find((c) => c.id === category)!);

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

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			formEl?.requestSubmit();
		}
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="min-h-0 flex-1 overflow-auto">
	<div class="mx-auto max-w-[792px] px-6 py-8">
		<div class="mb-3 flex items-center gap-2 text-[12px] text-text-3">
			<MobileMenuButton />
			<span class="inline-flex items-center gap-1.5">
				<span class="h-1.5 w-1.5 rounded-full" style:background={data.org.color}></span>
				<span>{data.org.name}</span>
			</span>
		</div>
		<h1 class="mb-5 text-[24px] font-semibold tracking-[-0.012em]">
			{m.tickets_new_open_heading()}
		</h1>

		<form
			bind:this={formEl}
			method="POST"
			action="/tickets?/create"
			enctype="multipart/form-data"
			use:enhance={({ formData }) => {
				for (const file of stagedFiles) formData.append('attachments', file);
				submitting = true;
				return async ({ result }: { result: ActionResult }) => {
					submitting = false;
					if (result.type === 'success') {
						const id = (result.data as { id?: string } | undefined)?.id;
						showToast('ok', m.tickets_created_simple());
						if (id) await goto(`/tickets/${id}`);
					} else if (result.type === 'failure') {
						showToast(
							'err',
							(result.data as { message?: string } | undefined)?.message ??
								m.tickets_create_failed()
						);
					} else if (result.type === 'error') {
						showToast('err', result.error?.message ?? m.tickets_create_failed());
					}
				};
			}}
		>
			<AttachmentDropzone onfiles={addFiles} disabled={submitting} label={m.tickets_dropzone_new()}>
				<div
					class="rounded-xl border border-border bg-bg-elev px-5 pt-5 pb-3 transition-colors focus-within:border-border-strong"
				>
					<input
						type="text"
						name="subject"
						bind:value={subject}
						required
						placeholder={m.tickets_subject_placeholder()}
						class="mb-3 block w-full border-0 bg-transparent text-[22px] font-semibold tracking-[-0.01em] text-text outline-none placeholder:text-text-3"
					/>
					<RichTextInput
						bind:value={description}
						placeholder={m.tickets_description_placeholder()}
						flavor="document"
						mentions={false}
						rows={8}
						maxRows={16}
						class="mb-4 w-full border-0 bg-transparent text-[14px] leading-relaxed text-text-2"
					/>
					<input type="hidden" name="description" value={description} />

					<!-- Staged files sit inside the box, as chips, like the composer. -->
					{#if stagedFiles.length}
						<div class="mb-3">
							<StagedFileList
								variant="chips"
								files={stagedFiles}
								disabled={submitting}
								onremove={(i) => (stagedFiles = stagedFiles.filter((_, idx) => idx !== i))}
							/>
						</div>
					{/if}

					<!-- Quiet controls: priority and category, files at the end. -->
					<div class="-mx-2.5 flex flex-wrap items-center gap-0.5">
						<!-- Priority -->
						<div class="relative">
							<button
								type="button"
								onclick={() => (pop = pop === 'priority' ? null : 'priority')}
								class="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] leading-none text-text-2 transition-colors hover:bg-surface hover:text-text {pop ===
								'priority'
									? 'bg-surface text-text'
									: ''}"
							>
								<PriorityBars {priority} />
								<span>{priorityLabel(priority)}</span>
								<Icon name="chevron" size={12} class="text-text-4" />
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
												class="ml-auto text-accent {priority === p.id
													? 'opacity-100'
													: 'opacity-0'}"
											>
												<Icon name="check" size={14} />
											</span>
										</button>
									{/each}
								</div>
							{/if}
						</div>

						<!-- Category -->
						<div class="relative">
							<button
								type="button"
								onclick={() => (pop = pop === 'category' ? null : 'category')}
								class="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] leading-none text-text-2 transition-colors hover:bg-surface hover:text-text {pop ===
								'category'
									? 'bg-surface text-text'
									: ''}"
							>
								<span class="h-2 w-2 rounded-full" style:background={categoryMeta.color}></span>
								<span>{ticketCategoryLabel(category)}</span>
								<Icon name="chevron" size={12} class="text-text-4" />
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
												class="ml-auto text-accent {category === c.id
													? 'opacity-100'
													: 'opacity-0'}"
											>
												<Icon name="check" size={14} />
											</span>
										</button>
									{/each}
								</div>
							{/if}
						</div>

						<button
							type="button"
							onclick={() => fileInput?.click()}
							class="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] leading-none text-text-3 transition-colors hover:bg-surface hover:text-text"
						>
							<Icon name="paperclip" size={14} />
							<span>{m.tickets_attach_files()}</span>
						</button>
						<input bind:this={fileInput} type="file" multiple hidden onchange={onPick} />
					</div>

					<input type="hidden" name="orgId" value={data.org.id} />
					<input type="hidden" name="priority" value={priority} />
					<input type="hidden" name="category" value={category} />
					<input type="hidden" name="channel" value="web_form" />
				</div>
			</AttachmentDropzone>

			<!-- Cancel and Create share one box, so they're the same height. ⌘↵
			     still submits. -->
			<div class="mt-4 flex items-center justify-end gap-2">
				<button
					type="button"
					onclick={() => history.back()}
					class="{FOOT_BUTTON} border-border bg-surface text-text hover:bg-surface-2"
				>
					{m.common_cancel()}
				</button>
				<button
					type="submit"
					disabled={submitting || !subject.trim()}
					class="{FOOT_BUTTON} border-transparent bg-accent text-white hover:bg-accent-strong"
				>
					{submitting ? m.common_creating() : m.tickets_create()}
				</button>
			</div>
		</form>
	</div>
</div>
