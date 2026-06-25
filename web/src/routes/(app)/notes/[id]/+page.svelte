<script lang="ts">
	import { browser } from '$app/environment';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { deserialize } from '$app/forms';
	import type { ActionResult } from '@sveltejs/kit';
	import Icon from '$lib/components/Icon.svelte';
	import IconButton from '$lib/components/IconButton.svelte';
	import Popover from '$lib/components/Popover.svelte';
	import { confirm } from '$lib/components/confirm.svelte';
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
	const meetingDateLabel = $derived(
		note.meetingDate
			? new Date(note.meetingDate).toLocaleDateString(undefined, {
					weekday: 'short',
					month: 'short',
					day: 'numeric',
					year: 'numeric'
				})
			: null
	);

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

	let editorWrap = $state<HTMLDivElement>();
	let hoverTodoEl = $state<HTMLElement | null>(null);
	let hoverTodoTop = $state(0);
	let convertOpen = $state(false);
	let convertPrefill = $state<{ project?: string; title?: string } | undefined>(undefined);
	let convertTargetEl: HTMLElement | null = null;

	// Bulk convert: a header button gathers every open (unchecked) todo on the
	// page and feeds them to a stepper modal.
	let bulkOpen = $state(false);
	let bulkTodos = $state<SourceTodo[]>([]);

	function onEditorPointerMove(e: PointerEvent) {
		if (!canEdit || !editorWrap) return;
		const target = e.target as HTMLElement | null;
		// Moving onto the floating button must not dismiss it.
		if (target?.closest?.('[data-todo-action]')) return;
		// TaskItem's node view renders a plain <li> carrying only `data-checked`
		// (no data-type), so that attribute is the reliable hook for a todo row.
		const li = target?.closest?.('li[data-checked]') as HTMLElement | null;
		if (!li) {
			hoverTodoEl = null;
			return;
		}
		hoverTodoEl = li;
		hoverTodoTop = li.getBoundingClientRect().top - editorWrap.getBoundingClientRect().top;
	}

	// Resolve the taskItem ProseMirror node + its document position from a DOM
	// <li>. Returns null if the element is stale or not inside a taskItem.
	function todoNodeAt(el: HTMLElement): { pos: number; text: string } | null {
		if (!editor) return null;
		// The node view's <li> wraps a content <div> (contentDOM). Resolving from
		// the inner content is the most reliable; fall back to the <li> itself.
		const anchors = [el.querySelector('div'), el].filter(Boolean) as HTMLElement[];
		for (const anchor of anchors) {
			try {
				const at = editor.view.posAtDOM(anchor, 0);
				const rpos = editor.state.doc.resolve(at);
				for (let d = rpos.depth; d > 0; d--) {
					const node = rpos.node(d);
					if (node.type.name === 'taskItem') {
						return { pos: rpos.before(d), text: node.textContent.trim() };
					}
				}
			} catch {
				/* element detached or remapped — try the next anchor / bail out */
			}
		}
		return null;
	}

	function openConvert() {
		if (!hoverTodoEl) return;
		const info = todoNodeAt(hoverTodoEl);
		if (!info) return;
		convertTargetEl = hoverTodoEl;
		convertPrefill = { project: project?.key, title: info.text };
		convertOpen = true;
	}

	// After the task exists: tick the todo and append " · TRACK-42" as a link
	// to the end of the todo's text. Done in one transaction so it syncs cleanly
	// over the collaborative document.
	function onTaskCreated(displayId: string) {
		const el = convertTargetEl;
		convertTargetEl = null;
		if (!editor || !el || !displayId) return;
		const info = todoNodeAt(el);
		if (!info) return;
		const url = `/tasks?task=${displayId}`;
		editor
			.chain()
			.command(({ tr }) => {
				const node = tr.doc.nodeAt(info.pos);
				const para = node?.firstChild;
				if (!node || node.type.name !== 'taskItem' || !para) return false;
				const insertPos = info.pos + 1 + para.nodeSize - 1; // end of the todo's text
				const link = editor!.schema.marks.link.create({ href: url });
				const sep = editor!.schema.text('  ·  ');
				const ref = editor!.schema.text(displayId, [link]);
				tr.insert(insertPos, sep);
				tr.insert(insertPos + sep.nodeSize, ref);
				tr.setNodeMarkup(info.pos, undefined, { ...node.attrs, checked: true });
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
		const name = window.prompt(m.notes_template_name_prompt());
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

<svelte:head><title>{note.title || m.notes_untitled()}</title></svelte:head>

<div class="relative min-h-full">
	<header
		class="sticky top-0 z-20 flex h-[52px] items-center gap-3 border-b border-border/70 bg-bg/80 px-8 backdrop-blur-md"
	>
		{#if note.kind === 'meeting'}
			{#if project}
				<a
					href="/projects/{project.id}"
					class="flex h-7 items-center gap-1.5 rounded-md bg-surface px-2 text-[12px] text-text-2 transition-colors hover:text-text"
					title={m.notes_meeting_project({ name: project.name })}
				>
					<span class="h-2 w-2 shrink-0 rounded-[2.5px]" style:background={project.color}></span>
					<span class="max-w-[160px] truncate">{project.name}</span>
				</a>
			{/if}
			{#if task && taskRef}
				<a
					href="/tasks?task={taskRef}"
					class="flex h-7 items-center gap-1.5 rounded-md bg-surface px-2 text-[12px] text-text-3 transition-colors hover:text-text"
					title={task.title}
				>
					<Icon name="check-square" size={12} class="shrink-0" />
					<span class="shrink-0 font-mono">{taskRef}</span>
					<span class="max-w-[140px] truncate">{task.title}</span>
				</a>
			{/if}
			{#if meetingDateLabel}
				<span class="flex items-center gap-1.5 text-[12px] text-text-3">
					<Icon name="calendar" size={13} />
					{meetingDateLabel}
				</span>
			{/if}
		{/if}

		{#if !canEdit}
			<span
				class="flex items-center gap-1.5 rounded-md bg-surface px-2 py-0.5 text-[11.5px] text-text-3"
			>
				<Icon name="link" size={12} />
				{m.notes_read_only()}
			</span>
		{/if}

		<div class="ml-auto flex items-center gap-3">
			{#if others.length > 0}
				<div class="flex items-center -space-x-1.5">
					{#each others.slice(0, 4) as u (u.clientId)}
						<span
							class="grid place-items-center rounded-full text-[9.5px] font-semibold text-white select-none size-[22px]"
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
				<span class="text-[11.5px] text-text-3">{statusLabel}</span>
			{/if}

			<div class="h-4 w-px bg-border"></div>

			{#if canEdit}
				<IconButton ariaLabel={m.notes_bulk_tooltip()} onclick={openBulk}>
					<Icon name="check-square" size={14} />
				</IconButton>
			{/if}
			{#if isOwner}
				<IconButton ariaLabel={m.notes_share_title()} onclick={() => (shareOpen = true)}>
					<Icon name="link" size={14} />
				</IconButton>
			{/if}
			<div class="relative">
				<IconButton ariaLabel={m.notes_more()} onclick={() => (menuOpen = !menuOpen)}>
					<Icon name="settings" size={14} />
				</IconButton>
				<Popover open={menuOpen} onclose={() => (menuOpen = false)} align="right" minWidth={170}>
					<button
						type="button"
						onclick={() => void onSaveAsTemplate()}
						class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] leading-none text-text-2 hover:bg-surface-2"
					>
						<span class="grid h-4 w-4 place-items-center"><Icon name="bookmark" size={13} /></span>
						<span>{m.notes_save_as_template()}</span>
					</button>
					{#if isOwner}
						<button
							type="button"
							onclick={() => void onDelete()}
							class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] leading-none text-accent hover:bg-surface-2"
						>
							<span class="grid h-4 w-4 place-items-center"><Icon name="trash" size={13} /></span>
							<span>{m.notes_delete()}</span>
						</button>
					{/if}
				</Popover>
			</div>
		</div>
	</header>

	<div class="mx-auto max-w-[760px] px-8 pt-12 pb-28">
		<div class="mb-8 flex items-start gap-3.5">
			<span class="notes-doc__icon shrink-0">
				<Icon name={note.icon || 'file'} size={20} stroke={1.75} />
			</span>
			<input
				bind:value={titleDraft}
				maxlength="120"
				readonly={!canEdit}
				placeholder={m.notes_untitled()}
				oninput={onTitleInput}
				onblur={() => void saveTitle()}
				onkeydown={onTitleKeydown}
				class="w-full border-0 bg-transparent pt-1 text-[33px] leading-[1.12] font-semibold tracking-[-0.02em] text-text outline-none placeholder:text-text-4 read-only:cursor-default"
			/>
		</div>

		{#if browser && note.documentId}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				bind:this={editorWrap}
				class="relative"
				onpointermove={onEditorPointerMove}
				onpointerleave={() => (hoverTodoEl = null)}
			>
				{#key note.documentId}
					<CollaborativeWikiEditor
						documentId={note.documentId}
						pageId={note.id}
						entityType="note"
						editable={canEdit}
						user={collabUser}
						placeholder={m.notes_editor_placeholder()}
						onReady={(ed) => (editor = ed)}
						onStatus={(s) => (collabStatus = s)}
						onPresence={(u) => (presence = u)}
					/>
				{/key}
				{#if canEdit && hoverTodoEl}
					<button
						type="button"
						data-todo-action
						onclick={openConvert}
						title={m.notes_todo_to_task()}
						class="absolute right-1 z-10 inline-flex h-6 items-center gap-1 rounded-md border border-border bg-bg-elev px-1.5 text-[11px] text-text-3 shadow-sm transition-colors hover:border-border-strong hover:text-text"
						style:top="{hoverTodoTop}px"
					>
						<Icon name="check-square" size={12} />
						{m.notes_todo_to_task_short()}
					</button>
				{/if}
			</div>
		{/if}
	</div>
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
		margin-top: 2px;
	}
</style>
