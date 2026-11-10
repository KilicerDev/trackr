<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { showToast } from '$lib/stores/toast.svelte';
	import type { ActionResult } from '@sveltejs/kit';
	import Modal from '../Modal.svelte';
	import Icon from '../Icon.svelte';
	import RichTextInput from '../RichTextInput.svelte';
	import { QUIET_ADD } from '../tasks/panel/styles';
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

	// Property rows (same as the create-task dialog's list) and the footer
	// buttons, which share one box so Cancel and Create are the same height.
	const ROW =
		'grid w-full grid-cols-[100px_minmax(0,1fr)] items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] leading-5 transition-colors hover:bg-surface';
	const FOOT_BUTTON =
		'inline-flex h-9 items-center justify-center rounded-lg border px-4 text-[14px] leading-none font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';

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

<Modal {open} {onclose} maxWidth={820}>
	<form
		bind:this={formEl}
		class="relative"
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
			<!-- Same anatomy as the create-task dialog: no head bar or divider
			     lines, close floats top-right, writing on the wider left and the
			     properties in a tinted column on the right. -->
			<h2 class="sr-only">{m.tickets_new_title()}</h2>
			<button
				type="button"
				onclick={onclose}
				aria-label={m.common_close()}
				class="absolute top-3 right-3 z-10 grid h-8 w-8 place-items-center rounded-lg text-text-3 transition-colors hover:bg-surface hover:text-text"
			>
				<Icon name="x" size={15} />
			</button>

			<div class="grid md:grid-cols-[minmax(0,1fr)_320px]">
				<div class="min-w-0 px-6 pt-6 pb-4">
					<input
						type="text"
						name="subject"
						bind:value={subject}
						required
						placeholder={m.tickets_subject_placeholder()}
						class="mb-2 block w-full border-0 bg-transparent text-[22px] font-semibold tracking-[-0.01em] text-text outline-none placeholder:text-text-3"
					/>
					<RichTextInput
						bind:value={description}
						placeholder={m.tickets_description_placeholder()}
						flavor="document"
						mentions={false}
						rows={5}
						maxRows={14}
						class="w-full border-0 bg-transparent text-[14px] leading-relaxed text-text-2"
					/>
					<input type="hidden" name="description" value={description} />

					<input type="hidden" name="orgId" value={orgId} />
					<input type="hidden" name="priority" value={priority} />
					<input type="hidden" name="category" value={category} />
					<input type="hidden" name="channel" value="web_form" />
					{#each assignees as id (id)}
						<input type="hidden" name="assignees" value={id} />
					{/each}

					{#if stagedFiles.length}
						<div class="mt-4">
							<StagedFileList
								files={stagedFiles}
								disabled={submitting}
								onremove={(i) => (stagedFiles = stagedFiles.filter((_, idx) => idx !== i))}
							/>
						</div>
					{/if}
					<input bind:this={fileInput} type="file" multiple hidden onchange={onPick} />
				</div>

				<!-- Properties: label / value rows that open their picker. -->
				<div
					class="mx-3 mb-1 flex flex-col gap-px rounded-xl bg-surface/40 px-2 py-3 md:mx-0 md:mt-12 md:mr-3 md:mb-0"
				>
					<div class="relative">
						<button
							type="button"
							disabled={!!lockedOrgId}
							onclick={() => (pop = pop === 'org' ? null : 'org')}
							class="{ROW} {selectedOrg ? 'text-text' : 'text-text-3'} {pop === 'org'
								? 'bg-surface'
								: ''} disabled:cursor-default disabled:hover:bg-transparent"
						>
							<span class="text-text-3">{m.tickets_field_organization()}</span>
							<span class="flex min-w-0 items-center gap-1.5">
								{#if selectedOrg}
									<span class="h-2 w-2 shrink-0 rounded-full" style:background={selectedOrg.color}
									></span>
									<span class="truncate">{selectedOrg.name}</span>
								{:else}
									<span class="truncate">{m.tickets_select_org_placeholder()}</span>
								{/if}
							</span>
						</button>
						{#if pop === 'org'}
							<div
								use:clickOutside={() => (pop = null)}
								in:fly={POPOVER_IN}
								class="absolute top-full right-0 z-50 mt-1.5 min-w-[242px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
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

					<div class="relative">
						<button
							type="button"
							onclick={() => (pop = pop === 'priority' ? null : 'priority')}
							class="{ROW} text-text {pop === 'priority' ? 'bg-surface' : ''}"
						>
							<span class="text-text-3">{m.tickets_field_priority()}</span>
							<span class="flex min-w-0 items-center gap-1.5">
								<PriorityBars {priority} />
								<span class="truncate">{priorityLabel(priority)}</span>
							</span>
						</button>
						{#if pop === 'priority'}
							<div
								use:clickOutside={() => (pop = null)}
								in:fly={POPOVER_IN}
								class="absolute top-full right-0 z-50 mt-1.5 min-w-[176px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
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

					<div class="relative">
						<button
							type="button"
							onclick={() => (pop = pop === 'category' ? null : 'category')}
							class="{ROW} text-text {pop === 'category' ? 'bg-surface' : ''}"
						>
							<span class="text-text-3">{m.tickets_field_category()}</span>
							<span class="flex min-w-0 items-center gap-1.5">
								<span class="h-2 w-2 shrink-0 rounded-full" style:background={categoryMeta.color}
								></span>
								<span class="truncate">{ticketCategoryLabel(category)}</span>
							</span>
						</button>
						{#if pop === 'category'}
							<div
								use:clickOutside={() => (pop = null)}
								in:fly={POPOVER_IN}
								class="absolute top-full right-0 z-50 mt-1.5 min-w-[198px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
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

					<!-- Assignee (agents only, for orgs where they may assign). -->
					{#if canAssign}
						<div class="relative">
							<button
								type="button"
								onclick={() => (pop = pop === 'assignee' ? null : 'assignee')}
								class="{ROW} {assigneeUsers.length ? 'text-text' : 'text-text-3'} {pop ===
								'assignee'
									? 'bg-surface'
									: ''}"
							>
								<span class="text-text-3">{m.tickets_field_assignee()}</span>
								<span class="flex min-w-0 items-center gap-1.5">
									{#if assigneeUsers.length === 1}
										<Avatar user={assigneeUsers[0]} size={22} />
										<span class="truncate">{assigneeUsers[0].name}</span>
									{:else if assigneeUsers.length > 1}
										<AvatarStack users={assigneeUsers} size={22} max={3} overlap={6} />
										<span class="truncate"
											>{m.tickets_n_assignees({ n: assigneeUsers.length })}</span
										>
									{:else}
										<span class="truncate">{m.common_unassigned()}</span>
									{/if}
								</span>
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
			</div>

			<!-- Foot: attach on the left (files can also be dropped on the dialog);
			     Cancel and Create built from the same box so they match. ⌘↵ still
			     submits. The 12px right inset lines Create up with the column. -->
			<div class="flex items-center gap-2 rounded-b-2xl pt-3 pr-3 pb-3 pl-6">
				<button type="button" onclick={() => fileInput?.click()} class="{QUIET_ADD} -ml-2">
					<Icon name="paperclip" size={14} />
					{m.tickets_attach_files()}
				</button>
				<div class="ml-auto flex items-center gap-2">
					<button
						type="button"
						onclick={onclose}
						class="{FOOT_BUTTON} border-border bg-surface text-text hover:bg-surface-2"
					>
						{m.common_cancel()}
					</button>
					<button
						type="submit"
						disabled={submitting || !subject.trim() || !orgId}
						class="{FOOT_BUTTON} border-transparent bg-accent text-white hover:bg-accent-strong"
					>
						{submitting ? m.common_creating() : m.tickets_create()}
					</button>
				</div>
			</div>
		</AttachmentDropzone>
	</form>
</Modal>
