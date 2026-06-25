<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { ActionResult } from '@sveltejs/kit';
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Button from '$lib/components/Button.svelte';
	import Kbd from '$lib/components/Kbd.svelte';
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

	const priorityMeta = $derived(TICKET_PRIORITIES.find((p) => p.id === priority)!);
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

<Topbar crumbs={[{ label: data.org.name }, { label: m.tickets_new_title() }]} />

<div class="min-h-0 flex-1 overflow-auto">
	<div class="mx-auto max-w-[720px] px-6 py-8">
		<div class="mb-3 flex items-center gap-2 text-[11px] text-text-3">
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
				<div class="rounded-2xl border border-border bg-bg-elev p-5">
					<input
						type="text"
						name="subject"
						bind:value={subject}
						required
						placeholder={m.tickets_subject_placeholder()}
						class="mb-3 block w-full border-0 bg-transparent text-[20px] font-semibold tracking-[-0.01em] text-text outline-none placeholder:text-text-3"
					/>
					<textarea
						name="description"
						bind:value={description}
						placeholder={m.tickets_description_placeholder()}
						rows="6"
						class="mb-4 w-full resize-none border-0 bg-transparent text-[14px] leading-relaxed text-text-2 outline-none placeholder:text-text-3"
					></textarea>

					<div class="flex flex-wrap gap-2">
						<!-- Priority -->
						<div class="relative">
							<button
								type="button"
								onclick={() => (pop = pop === 'priority' ? null : 'priority')}
								class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] transition-colors hover:border-border-strong"
							>
								<PriorityBars {priority} />
								<span>{priorityLabel(priority)}</span>
								<Icon name="chevron" size={11} class="text-text-3" />
							</button>
							{#if pop === 'priority'}
								<div
									use:clickOutside={() => (pop = null)}
									in:fly={POPOVER_IN}
									class="absolute top-full z-50 mt-1.5 min-w-[160px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
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
												class="ml-auto text-accent {priority === p.id
													? 'opacity-100'
													: 'opacity-0'}"
											>
												<Icon name="check" size={13} />
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
								class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] transition-colors hover:border-border-strong"
							>
								<span class="h-2 w-2 rounded-full" style:background={categoryMeta.color}></span>
								<span>{ticketCategoryLabel(category)}</span>
								<Icon name="chevron" size={11} class="text-text-3" />
							</button>
							{#if pop === 'category'}
								<div
									use:clickOutside={() => (pop = null)}
									in:fly={POPOVER_IN}
									class="absolute top-full z-50 mt-1.5 min-w-[180px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
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
												class="ml-auto text-accent {category === c.id
													? 'opacity-100'
													: 'opacity-0'}"
											>
												<Icon name="check" size={13} />
											</span>
										</button>
									{/each}
								</div>
							{/if}
						</div>

						<button
							type="button"
							onclick={() => fileInput?.click()}
							class="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-[13px] text-text-3 transition-colors hover:border-border-strong hover:text-text"
						>
							<Icon name="paperclip" size={13} />
							<span>{m.tickets_attach_files()}</span>
						</button>
						<input bind:this={fileInput} type="file" multiple hidden onchange={onPick} />
					</div>

					{#if stagedFiles.length}
						<div class="mt-3">
							<StagedFileList
								files={stagedFiles}
								disabled={submitting}
								onremove={(i) => (stagedFiles = stagedFiles.filter((_, idx) => idx !== i))}
							/>
						</div>
					{/if}

					<input type="hidden" name="orgId" value={data.org.id} />
					<input type="hidden" name="priority" value={priority} />
					<input type="hidden" name="category" value={category} />
					<input type="hidden" name="channel" value="web_form" />
				</div>
			</AttachmentDropzone>

			<div class="mt-4 flex items-center gap-2">
				<span class="text-[11px] text-text-3"><Kbd>⌘↵</Kbd> {m.tickets_kbd_to_submit()}</span>
				<div class="ml-auto flex items-center gap-2">
					<Button variant="default" onclick={() => history.back()}>{m.common_cancel()}</Button>
					<button
						type="submit"
						disabled={submitting || !subject.trim()}
						class="inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-accent px-[13px] py-[8px] text-[13px] font-medium text-white shadow-btn transition-[background,border-color,transform] duration-150 hover:bg-accent-strong active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50"
					>
						{submitting ? m.common_creating() : m.tickets_create()}
					</button>
				</div>
			</div>
		</form>
	</div>
</div>
