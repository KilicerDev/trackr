<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { showToast } from '$lib/stores/toast.svelte';
	import type { ActionResult } from '@sveltejs/kit';
	import Modal from '../Modal.svelte';
	import Icon from '../Icon.svelte';
	import RichTextInput from '../RichTextInput.svelte';
	import Button from '../Button.svelte';
	import Kbd from '../Kbd.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import Avatar from '../Avatar.svelte';
	import AvatarStack from '../AvatarStack.svelte';
	import AssigneePopover from '../popovers/AssigneePopover.svelte';
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
	type AssignableUser = {
		id: string;
		name: string;
		email?: string;
		initials: string;
		color: string;
		status?: string;
		internal?: boolean;
		orgIds?: string[];
	};

	interface Props {
		open: boolean;
		onclose: () => void;
		orgs?: OrgOption[];
		// Restrict the org picker to a specific org and lock it (used for
		// client-role users who can only file against their own org).
		lockedOrgId?: string | null;
		// Preselect an org but leave the picker editable (used when opening the
		// modal from an org-grouped board column).
		prefillOrgId?: string | null;
		// Assignee candidates (org members + internal platform agents, each row
		// tagged with its `orgIds` / `internal`). Scoped to the selected org here.
		users?: AssignableUser[];
		// Orgs where the viewer may assign on create (edit.any). The picker is
		// hidden for other orgs — the server drops assignees there anyway.
		assignableOrgIds?: string[];
	}

	let {
		open,
		onclose,
		orgs = [],
		lockedOrgId = null,
		prefillOrgId = null,
		users = [],
		assignableOrgIds = []
	}: Props = $props();

	type Priority = (typeof TICKET_PRIORITIES)[number]['id'];
	type Category = (typeof TICKET_CATEGORIES)[number]['id'];

	let subject = $state('');
	let description = $state('');
	let orgId = $state<string>('');
	let priority = $state<Priority>('medium');
	let category = $state<Category>('general');
	let assignees = $state<string[]>([]);
	let submitting = $state(false);

	let formEl = $state<HTMLFormElement>();
	let fileInput = $state<HTMLInputElement>();
	let stagedFiles = $state<File[]>([]);
	let pop = $state<'org' | 'priority' | 'category' | 'assignee' | null>(null);

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

	const canAssign = $derived(!!orgId && assignableOrgIds.includes(orgId));
	// Candidates for the selected org: its members plus internal platform agents
	// (assignable on every org). Mirrors the list-page Inspector scoping.
	const assignableForOrg = $derived(
		canAssign
			? users.filter(
					(u) => u.status !== 'disabled' && (u.internal || (u.orgIds ?? []).includes(orgId))
				)
			: []
	);
	const assigneeUsers = $derived(
		assignees
			.map((id) => assignableForOrg.find((u) => u.id === id))
			.filter((u): u is AssignableUser => !!u)
	);

	// Switching org drops any picked assignee who isn't a candidate there.
	$effect(() => {
		const allowed = new Set(assignableForOrg.map((u) => u.id));
		if (assignees.some((id) => !allowed.has(id))) {
			assignees = assignees.filter((id) => allowed.has(id));
		}
	});

	$effect(() => {
		if (open) {
			subject = '';
			description = '';
			orgId = lockedOrgId ?? prefillOrgId ?? orgs[0]?.id ?? '';
			priority = 'medium';
			category = 'general';
			assignees = [];
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
					<div class="text-[12px] tracking-[0.08em] text-text-4 uppercase">
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
					<Icon name="x" size={15} />
				</button>
			</div>

			<div class="px-5 pt-5 pb-3">
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
					rows={4}
					maxRows={12}
					class="mb-4 w-full border-0 bg-transparent text-[14px] leading-relaxed text-text-2"
				/>
				<input type="hidden" name="description" value={description} />

				<div class="flex flex-wrap gap-2">
					<!-- Org picker -->
					<div class="relative">
						<button
							type="button"
							disabled={!!lockedOrgId}
							onclick={() => (pop = pop === 'org' ? null : 'org')}
							class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[14px] transition-colors hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-70"
						>
							{#if selectedOrg}
								<span class="h-2 w-2 rounded-full" style:background={selectedOrg.color}></span>
								<span>{selectedOrg.name}</span>
							{:else}
								<Icon name="org" size={14} class="text-text-3" />
								<span>{m.tickets_select_org_placeholder()}</span>
							{/if}
							{#if !lockedOrgId}<Icon name="chevron" size={12} class="text-text-3" />{/if}
						</button>
						{#if pop === 'org'}
							<div
								use:clickOutside={() => (pop = null)}
								in:fly={POPOVER_IN}
								class="absolute top-full z-50 mt-1.5 min-w-[242px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
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
										<span class="truncate text-[14px]">{o.name}</span>
										<span
											class="ml-auto text-accent {orgId === o.id ? 'opacity-100' : 'opacity-0'}"
										>
											<Icon name="check" size={14} />
										</span>
									</button>
								{/each}
								{#if orgs.length === 0}
									<div class="px-2 py-2 text-[12px] text-text-3">
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

					<!-- Assignee picker (agents only) -->
					{#if canAssign}
						<div class="relative">
							<button
								type="button"
								onclick={() => (pop = pop === 'assignee' ? null : 'assignee')}
								class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[14px] transition-colors hover:border-border-strong hover:text-text {assigneeUsers.length
									? 'border border-border bg-surface'
									: 'border border-dashed border-border text-text-3'} {pop === 'assignee'
									? 'ring-2 ring-accent/40'
									: ''}"
							>
								{#if assigneeUsers.length === 1}
									<Avatar user={assigneeUsers[0]} size={18} />
									<span>{assigneeUsers[0].name}</span>
								{:else if assigneeUsers.length > 1}
									<AvatarStack users={assigneeUsers} size={18} max={3} overlap={6} />
									<span>{m.tickets_n_assignees({ n: assigneeUsers.length })}</span>
								{:else}
									<Icon name="user" size={14} />
									<span>{m.common_unassigned()}</span>
								{/if}
								<Icon name="chevron" size={12} class="text-text-3" />
							</button>
							{#if pop === 'assignee'}
								<AssigneePopover
									value={assignees}
									users={assignableForOrg}
									onchange={(v) => (assignees = v)}
									onclose={() => (pop = null)}
								/>
							{/if}
						</div>
					{/if}
				</div>

				<input type="hidden" name="orgId" value={orgId} />
				<input type="hidden" name="priority" value={priority} />
				<input type="hidden" name="category" value={category} />
				<input type="hidden" name="channel" value="web_form" />
				{#each assignees as id (id)}
					<input type="hidden" name="assignees" value={id} />
				{/each}

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
						class="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-[14px] text-text-3 transition-colors hover:border-border-strong hover:text-text"
					>
						<Icon name="paperclip" size={14} />
						<span>{m.tickets_attach_files()}</span>
					</button>
					<input bind:this={fileInput} type="file" multiple hidden onchange={onPick} />
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
						disabled={submitting || !subject.trim() || !orgId}
						class="inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-accent px-[12px] py-[8px] text-[14px] font-medium text-white shadow-btn transition-[background,border-color,transform] duration-150 hover:bg-accent-strong active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50"
					>
						{submitting ? m.common_creating() : m.tickets_create()}
					</button>
				</div>
			</div>
		</AttachmentDropzone>
	</form>
</Modal>
