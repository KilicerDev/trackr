<script lang="ts">
	import { formatWeekdayDate } from '$lib/utils/format';
	import { pageTitle } from '$lib/brand';
	import { browser } from '$app/environment';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { deserialize } from '$app/forms';
	import type { ActionResult } from '@sveltejs/kit';
	import Icon from '$lib/components/Icon.svelte';
	import DocOutline from '$lib/components/wiki/DocOutline.svelte';
	import MobileMenuButton from '$lib/components/shell/MobileMenuButton.svelte';
	import { getContext } from 'svelte';
	import SyncStatus from '$lib/components/SyncStatus.svelte';
	import { autosize } from '$lib/actions/autosize';
	import IconButton from '$lib/components/IconButton.svelte';
	import Popover from '$lib/components/Popover.svelte';
	import { confirm, prompt } from '$lib/components/confirm.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import CollaborativeWikiEditor, {
		type PresenceUser
	} from '$lib/components/wiki/CollaborativeWikiEditor.svelte';
	import ShareDialog from '$lib/components/notes/ShareDialog.svelte';
	import CreateTaskModal from '$lib/components/tasks/CreateTaskModal.svelte';
	import BulkCreateTasksModal, {
		type CreatedTodo,
		type SourceTodo
	} from '$lib/components/tasks/BulkCreateTasksModal.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { Editor } from '@tiptap/core';
	import type { WebSocketStatus } from '@hocuspocus/provider';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const note = $derived(data.note);
	const canEdit = $derived(data.role === 'write');
	const isOwner = $derived(data.isOwner);
	const me = $derived(data.me);

	type Project = { id: string; name: string; color: string; key?: string };
	type Task = { id: string; number: number; title: string; projectId: string };
	const project = $derived.by(() => {
		if (!note.projectId) return null;
		const list = ((page.data as { projects?: Project[] }).projects ?? []) as Project[];
		return list.find((p) => p.id === note.projectId) ?? null;
	});
	const task = $derived.by(() => {
		if (!note.taskId) return null;
		const list = ((page.data as { tasks?: Task[] }).tasks ?? []) as Task[];
		return list.find((t) => t.id === note.taskId) ?? null;
	});
	const taskRef = $derived(task ? `${project?.key ?? ''}-${task.number}` : null);
	const meetingDateLabel = $derived(note.meetingDate ? formatWeekdayDate(note.meetingDate) : null);

	let menuOpen = $state(false);
	let shareOpen = $state(false);
	let editor: Editor | undefined = $state();
	let collabStatus = $state<WebSocketStatus | undefined>(undefined);
	let presence = $state<PresenceUser[]>([]);

	// ─── Convert a todo (taskItem) into a Trackr task ───────────────────────
	// A hover button appears on each todo line; clicking it opens the standard
	// CreateTaskModal prefilled with the note's project + the todo text. On
	// success we tick the todo and append the new task's ref as an inline link.
	type LayoutData = {
		users?: {
			id: string;
			name: string;
			email: string;
			initials: string;
			color: string;
			status: 'active' | 'invited' | 'disabled';
		}[];
		projects?: {
			id: string;
			key: string;
			name: string;
			color: string;
			icon: string;
			status: string;
		}[];
		memberRoles?: { projects?: Record<string, string> };
		isTrackrTeam?: boolean;
		currentUserId?: string;
	};
	const layout = $derived(page.data as LayoutData);
	const crumbs =
		getContext<(() => { label: string; href?: string }[]) | undefined>('notes:crumbs') ??
		(() => []);

	let editorWrap = $state<HTMLDivElement>();
	let convertOpen = $state(false);
	let convertPrefill = $state<{ project?: string; title?: string } | undefined>(undefined);
	// The taskItem's start position for the to-do being converted (from the block
	// gutter). Re-resolved against the live doc on create, so a late edit can't
	// tick the wrong row.
	let convertTargetPos: number | null = null;

	// Bulk convert: a header button gathers every open (unchecked) todo on the
	// page and feeds them to a stepper modal.
	let bulkOpen = $state(false);
	let bulkTodos = $state<SourceTodo[]>([]);

	// ─── Outline (meeting notes): see DocOutline ─────────────────────────────
	let tocRev = $state(0);

	function onEditorReady(ed: Editor) {
		editor = ed;
		tocRev++;
	}

	// Block gutter → convert this to-do into a task (pos = the taskItem's start).
	function openConvert(pos: number, text: string) {
		if (!canEdit) return;
		convertTargetPos = pos;
		convertPrefill = { project: project?.key, title: text };
		convertOpen = true;
	}

	// After the task exists: tick the todo and append " · TRACK-42" as a link
	// to the end of the todo's text. Done in one transaction so it syncs cleanly
	// over the collaborative document.
	function onTaskCreated(displayId: string) {
		const pos = convertTargetPos;
		convertTargetPos = null;
		if (!editor || pos == null || !displayId) return;
		const url = `/tasks?task=${displayId}`;
		editor
			.chain()
			.command(({ tr }) => {
				const node = tr.doc.nodeAt(pos);
				const para = node?.firstChild;
				if (!node || node.type.name !== 'taskItem' || !para) return false;
				const insertPos = pos + 1 + para.nodeSize - 1; // end of the todo's text
				const link = editor!.schema.marks.link.create({ href: url });
				const sep = editor!.schema.text('  ·  ');
				const ref = editor!.schema.text(displayId, [link]);
				tr.insert(insertPos, sep);
				tr.insert(insertPos + sep.nodeSize, ref);
				tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: true });
				return true;
			})
			.run();
	}

	// Walk the document for every unchecked taskItem with text. The `pos` is the
	// taskItem's start position — the same coordinate `onBulkCreated` resolves
	// against later to tick it.
	function collectOpenTodos(): SourceTodo[] {
		if (!editor) return [];
		const out: SourceTodo[] = [];
		editor.state.doc.descendants((node, pos) => {
			if (node.type.name === 'taskItem' && node.attrs.checked !== true) {
				const text = node.textContent.trim();
				if (text) out.push({ pos, text });
			}
			return true;
		});
		return out;
	}

	function openBulk() {
		const todos = collectOpenTodos();
		if (!todos.length) {
			showToast('ok', m.notes_bulk_none());
			return;
		}
		bulkTodos = todos;
		bulkOpen = true;
	}

	// For each created task, tick its source todo and append the task ref link —
	// all in one transaction. Highest position first so the inserts/markups never
	// invalidate the positions of todos still to be processed.
	function onBulkCreated(created: CreatedTodo[]) {
		if (!editor || !created.length) return;
		const ordered = [...created].sort((a, b) => b.pos - a.pos);
		editor
			.chain()
			.command(({ tr }) => {
				let changed = false;
				for (const { pos, displayId } of ordered) {
					const node = tr.doc.nodeAt(pos);
					const para = node?.firstChild;
					if (!node || node.type.name !== 'taskItem' || !para) continue;
					if (displayId) {
						const insertPos = pos + 1 + para.nodeSize - 1; // end of the todo's text
						const link = editor!.schema.marks.link.create({ href: `/tasks?task=${displayId}` });
						const sep = editor!.schema.text('  ·  ');
						const ref = editor!.schema.text(displayId, [link]);
						tr.insert(insertPos, sep);
						tr.insert(insertPos + sep.nodeSize, ref);
					}
					tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: true });
					changed = true;
				}
				return changed;
			})
			.run();
	}

	function userColor(id: string): string {
		let h = 0;
		for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
		return `hsl(${h % 360} 55% 60%)`;
	}
	function initialsOf(name: string): string {
		return name
			.split(/\s+/)
			.map((p) => p[0])
			.filter(Boolean)
			.slice(0, 2)
			.join('')
			.toUpperCase();
	}
	const collabUser = $derived(
		me ? { name: me.name, color: userColor(me.id) } : { name: m.notes_someone(), color: '#888' }
	);

	const others = $derived.by(() => {
		const out: PresenceUser[] = [];
		for (const u of presence) {
			if (u.isSelf || out.some((o) => o.name === u.name)) continue;
			out.push(u);
		}
		return out;
	});

	// ─── Title (inline, debounced autosave) ─────────────────────────────────
	let titleDraft = $state(note.title);
	let titleTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		void note.id;
		titleDraft = note.title;
		collabStatus = undefined;
		presence = [];
	});

	async function saveTitle() {
		const title = titleDraft.trim();
		if (title === note.title || !canEdit) return;
		const fd = new FormData();
		fd.append('title', title);
		const res = await fetch(`/notes/${note.id}?/update`, {
			method: 'POST',
			body: fd,
			headers: { 'x-sveltekit-action': 'true' }
		});
		const result = deserialize(await res.text()) as ActionResult<
			{ success?: boolean },
			{ message?: string }
		>;
		if (result.type === 'failure') {
			showToast('err', result.data?.message ?? m.notes_toast_rename_failed());
			titleDraft = note.title;
		} else if (result.type === 'success') {
			await invalidateAll();
		}
	}
	function onTitleInput() {
		// Single line: a pasted line break becomes a space.
		if (/[\r\n]/.test(titleDraft)) titleDraft = titleDraft.replace(/[\r\n]+/g, ' ');
		clearTimeout(titleTimer);
		titleTimer = setTimeout(saveTitle, 800);
	}
	function onTitleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			clearTimeout(titleTimer);
			void saveTitle();
			editor?.commands.focus('start');
		}
	}

	async function onDelete() {
		menuOpen = false;
		const ok = await confirm({
			title: m.notes_confirm_delete_title(),
			message: m.notes_confirm_delete_message(),
			confirmLabel: m.common_delete(),
			tone: 'danger'
		});
		if (!ok) return;
		const res = await fetch(`/notes/${note.id}?/delete`, {
			method: 'POST',
			body: new FormData(),
			headers: { 'x-sveltekit-action': 'true' }
		});
		const result = deserialize(await res.text()) as ActionResult;
		if (result.type === 'redirect') {
			showToast('ok', m.notes_toast_deleted());
			// Client-side nav (not a hard reload) so the sidebar stays mounted and
			// its tab is preserved; invalidateAll refreshes the lists.
			await goto(result.location, { invalidateAll: true });
		} else {
			showToast('err', m.notes_toast_delete_failed());
		}
	}

	async function onSaveAsTemplate() {
		menuOpen = false;
		const name = await prompt({
			title: m.notes_template_name_title(),
			placeholder: m.notes_template_name_placeholder(),
			confirmLabel: m.common_save(),
			cancelLabel: m.common_cancel()
		});
		if (!name?.trim()) return;
		const fd = new FormData();
		fd.set('name', name.trim());
		const res = await fetch(`/notes/${note.id}?/saveAsTemplate`, {
			method: 'POST',
			body: fd,
			headers: { 'x-sveltekit-action': 'true' }
		});
		const result = deserialize(await res.text()) as ActionResult<
			Record<string, unknown>,
			{ message?: string }
		>;
		if (result.type === 'success') showToast('ok', m.notes_toast_template_saved());
		else showToast('err', m.notes_toast_template_failed());
	}

	const statusLabel = $derived(
		collabStatus === 'connected'
			? m.notes_status_live()
			: collabStatus === 'connecting'
				? m.notes_status_connecting()
				: collabStatus === 'disconnected'
					? m.notes_status_offline()
					: ''
	);
</script>

<svelte:head><title>{pageTitle(note.title || m.notes_untitled())}</title></svelte:head>

<!-- A FILE drop that misses the editor must not navigate the browser to the
     file (drops ON the editor are handled by WikiFileUpload/WikiImageUpload).
     Scoped to drags carrying Files: blanket preventDefault on dragover forces
     a "copy" drop effect, which breaks the editor's own drag-to-move (nodes
     duplicate instead of moving). -->
<svelte:window
	ondragover={(e) => {
		if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
	}}
	ondrop={(e) => {
		if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
	}}
/>

<div class="relative min-h-full">
	<header
		class="sticky top-0 z-20 flex h-[57px] items-center gap-3 border-b border-border/70 bg-bg/80 px-8 backdrop-blur-md"
	>
		<MobileMenuButton />
		<!-- Mobile: the list is hidden while a note is open; this leads back. -->
		<a
			href="/notes"
			aria-label={m.shell_nav_notes()}
			title={m.shell_nav_notes()}
			class="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border bg-surface text-text-2 transition-colors hover:text-text md:hidden"
		>
			<Icon name="arrow-left" size={15} />
		</a>
		{#if note.kind !== 'meeting'}
			<!-- Where the note sits: Notes / parent / … / this note. -->
			<nav class="flex min-w-0 items-center gap-1.5 text-[14px] max-md:hidden">
				{#each crumbs() as c, i (`${i}:${c.label}`)}
					{#if i > 0}<span class="text-text-4 select-none">/</span>{/if}
					{#if c.href}
						<a
							href={c.href}
							class="max-w-[176px] shrink-0 truncate text-text-3 transition-colors hover:text-text"
							>{c.label}</a
						>
					{:else}
						<span class="max-w-[264px] truncate font-medium text-text-2">{c.label}</span>
					{/if}
				{/each}
			</nav>
		{/if}
		{#if note.kind === 'meeting'}
			{#if project}
				<a
					href="/projects/{project.id}"
					class="flex h-7 items-center gap-1.5 rounded-md bg-surface px-2 text-[13px] text-text-2 transition-colors hover:text-text"
					title={m.notes_meeting_project({ name: project.name })}
				>
					<span class="h-2 w-2 shrink-0 rounded-[2.5px]" style:background={project.color}></span>
					<span class="max-w-[176px] truncate">{project.name}</span>
				</a>
			{/if}
			{#if task && taskRef}
				<a
					href="/tasks?task={taskRef}"
					class="flex h-7 items-center gap-1.5 rounded-md bg-surface px-2 text-[13px] text-text-3 transition-colors hover:text-text"
					title={task.title}
				>
					<Icon name="check-square" size={13} class="shrink-0" />
					<span class="shrink-0 font-mono">{taskRef}</span>
					<span class="max-w-[154px] truncate">{task.title}</span>
				</a>
			{/if}
			{#if meetingDateLabel}
				<span class="flex shrink-0 items-center gap-1.5 text-[13px] whitespace-nowrap text-text-3">
					<Icon name="calendar" size={14} />
					{meetingDateLabel}
				</span>
			{/if}
		{/if}

		{#if !canEdit}
			<span
				class="flex items-center gap-1.5 rounded-md bg-surface px-2 py-0.5 text-[12px] text-text-3"
			>
				<Icon name="link" size={13} />
				{m.notes_read_only()}
			</span>
		{/if}

		<div class="ml-auto flex items-center gap-3">
			{#if others.length > 0}
				<div class="flex items-center -space-x-1.5">
					{#each others.slice(0, 4) as u (u.clientId)}
						<span
							class="grid size-[24px] place-items-center rounded-full text-[11px] font-semibold text-white select-none"
							style:background={u.color}
							style:box-shadow="0 0 0 2px var(--bg), 0 0 0 3.5px {u.color}55"
							title={u.name}
						>
							{initialsOf(u.name)}
						</span>
					{/each}
				</div>
			{/if}

			{#if statusLabel}
				<SyncStatus state={collabStatus ?? 'idle'} label={statusLabel} />
			{/if}

			<!-- Everything else lives in the ⋯ menu. -->
			<div class="relative">
				<IconButton ariaLabel={m.notes_more()} onclick={() => (menuOpen = !menuOpen)}>
					<Icon name="more" size={16} />
				</IconButton>
				<Popover open={menuOpen} onclose={() => (menuOpen = false)} align="right" minWidth={230}>
					{#if canEdit}
						<button
							type="button"
							onclick={() => {
								menuOpen = false;
								openBulk();
							}}
							class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[14px] leading-none text-text-2 hover:bg-surface-2 hover:text-text"
						>
							<span class="grid h-4 w-4 place-items-center text-text-3"
								><Icon name="check-square" size={14} /></span
							>
							<span>{m.notes_bulk_tooltip()}</span>
						</button>
					{/if}
					{#if isOwner}
						<button
							type="button"
							onclick={() => {
								menuOpen = false;
								shareOpen = true;
							}}
							class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[14px] leading-none text-text-2 hover:bg-surface-2 hover:text-text"
						>
							<span class="grid h-4 w-4 place-items-center text-text-3"
								><Icon name="link" size={14} /></span
							>
							<span>{m.notes_share_title()}</span>
						</button>
					{/if}
					<button
						type="button"
						onclick={() => {
							menuOpen = false;
							void onSaveAsTemplate();
						}}
						class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[14px] leading-none text-text-2 hover:bg-surface-2 hover:text-text"
					>
						<span class="grid h-4 w-4 place-items-center text-text-3"
							><Icon name="bookmark" size={14} /></span
						>
						<span>{m.notes_save_as_template()}</span>
					</button>
					{#if isOwner}
						<div class="-mx-0.5 my-1 h-px bg-border"></div>
						<button
							type="button"
							onclick={() => {
								menuOpen = false;
								void onDelete();
							}}
							class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[14px] leading-none text-accent hover:bg-surface-2"
						>
							<span class="grid h-4 w-4 place-items-center"><Icon name="trash" size={14} /></span>
							<span>{m.notes_delete()}</span>
						</button>
					{/if}
				</Popover>
			</div>
		</div>
	</header>

	<div class="mx-auto max-w-[848px] px-14 pt-14 pb-28">
		<div class="mb-6 flex items-start gap-3.5">
			<!-- Icon centered against the title's first line (h = title line-height),
			     so it stays with line 1 when a long title wraps. -->
			<span class="flex h-[1.15em] shrink-0 items-center text-[40px] max-md:text-[32px]">
				<span class="notes-doc__icon">
					<Icon name={note.icon || 'file'} size={22} stroke={1.75} />
				</span>
			</span>
			<!-- A one-row textarea so long titles wrap instead of clipping; Enter moves into the body. -->
			<textarea
				rows="1"
				bind:value={titleDraft}
				use:autosize={titleDraft}
				maxlength="120"
				readonly={!canEdit}
				placeholder={m.notes_untitled()}
				oninput={onTitleInput}
				onblur={() => void saveTitle()}
				onkeydown={onTitleKeydown}
				class="w-full resize-none overflow-hidden border-0 bg-transparent text-[40px] leading-[1.15] font-bold tracking-[-0.025em] text-text outline-none placeholder:text-text-4 read-only:cursor-default max-md:text-[32px]"
			></textarea>
		</div>

		{#if browser && note.documentId}
			<div bind:this={editorWrap} class="relative">
				{#key note.documentId}
					<CollaborativeWikiEditor
						documentId={note.documentId}
						pageId={note.id}
						entityType="note"
						editable={canEdit}
						user={collabUser}
						placeholder={m.notes_editor_placeholder()}
						onReady={onEditorReady}
						onUpdate={() => tocRev++}
						onStatus={(s) => (collabStatus = s)}
						onPresence={(u) => (presence = u)}
						onConvertTodo={canEdit ? openConvert : undefined}
					/>
				{/key}
			</div>
		{/if}
	</div>

	{#if note.kind === 'meeting'}
		{#key note.id}
			<DocOutline root={editorWrap} rev={tocRev} />
		{/key}
	{/if}
</div>

{#if isOwner}
	<ShareDialog bind:open={shareOpen} noteId={note.id} links={data.shareLinks} />
{/if}

{#if canEdit}
	<CreateTaskModal
		open={convertOpen}
		prefill={convertPrefill}
		onclose={() => (convertOpen = false)}
		oncreated={onTaskCreated}
		sourceNoteId={note.id}
		users={layout.users}
		projects={layout.projects}
		currentUserId={layout.currentUserId}
		memberProjectIds={Object.keys(layout.memberRoles?.projects ?? {})}
		allAccess={layout.isTrackrTeam}
	/>
	<BulkCreateTasksModal
		open={bulkOpen}
		todos={bulkTodos}
		defaultProjectKey={project?.key}
		onclose={() => (bulkOpen = false)}
		oncreated={onBulkCreated}
		sourceNoteId={note.id}
		users={layout.users ?? []}
		projects={layout.projects ?? []}
		currentUserId={layout.currentUserId}
		memberProjectIds={Object.keys(layout.memberRoles?.projects ?? {})}
		allAccess={layout.isTrackrTeam ?? false}
	/>
{/if}

<style>
	.notes-doc__icon {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 12px;
		color: var(--accent);
		background: color-mix(in oklab, var(--accent) 12%, var(--bg-elev));
		border: 1px solid color-mix(in oklab, var(--accent) 22%, var(--border));
	}
</style>
