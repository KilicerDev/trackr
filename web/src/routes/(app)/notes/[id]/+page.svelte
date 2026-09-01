<script lang="ts">
	import { browser } from '$app/environment';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { deserialize } from '$app/forms';
	import type { ActionResult } from '@sveltejs/kit';
	import Icon from '$lib/components/Icon.svelte';
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

	// ─── Outline / table of contents (meeting notes) ────────────────────────
	// A sticky right-gutter panel listing the document's headings so the reader
	// can jump between sections. Meeting-note only, and only when the viewport is
	// wide enough to fit the gutter (a container query hides it otherwise).
	type TocItem = { index: number; level: number; text: string };
	let tocItems = $state<TocItem[]>([]);
	let activeIndex = $state(-1);
	let tocCollapsed = $state(false);
	const showToc = $derived(note.kind === 'meeting' && tocItems.length > 0);

	function headingEls(): HTMLElement[] {
		const root = editorWrap?.querySelector('.ProseMirror');
		if (!root) return [];
		return Array.from(root.querySelectorAll('h1, h2, h3')) as HTMLElement[];
	}

	// Build the outline from the rendered heading DOM, keyed by each heading's
	// position in the list. We deliberately do NOT inject ids: ProseMirror
	// re-renders heading nodes on every edit and strips any attribute it doesn't
	// own, so a persisted id would silently disappear. Instead we re-query the
	// live DOM by index whenever we need to scroll or find the active section.
	function buildToc() {
		const items: TocItem[] = [];
		headingEls().forEach((el, index) => {
			const text = (el.textContent ?? '').trim();
			if (text) items.push({ index, level: Number(el.tagName[1]), text });
		});
		tocItems = items;
		computeActive();
	}

	// The active section is the last heading whose top has scrolled above the
	// sticky header band (57px + a little), so it highlights what you're reading.
	function computeActive() {
		const els = headingEls();
		if (!tocItems.length) {
			activeIndex = -1;
			return;
		}
		// At the very bottom the last heading can't reach the top band, so pin it
		// active — otherwise the final section could never highlight.
		const scroller = els[0] ? scrollParentOf(els[0]) : null;
		if (scroller && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) {
			activeIndex = tocItems[tocItems.length - 1].index;
			return;
		}
		let active = tocItems[0].index;
		for (const item of tocItems) {
			const el = els[item.index];
			if (!el) continue;
			if (el.getBoundingClientRect().top <= 96) active = item.index;
			else break;
		}
		activeIndex = active;
	}

	// Nearest scrollable ancestor of an element (the notes page scroll column).
	function scrollParentOf(el: HTMLElement): HTMLElement | null {
		let p = el.parentElement;
		while (p) {
			const oy = getComputedStyle(p).overflowY;
			if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
			p = p.parentElement;
		}
		return null;
	}

	// Animate the scroll ourselves: native scroll-behavior:smooth is unreliable
	// inside this nested scroll container, so we drive scrollTop with rAF.
	function smoothScrollTo(scroller: HTMLElement, target: number) {
		const start = scroller.scrollTop;
		const dest = Math.max(0, Math.min(target, scroller.scrollHeight - scroller.clientHeight));
		const dist = dest - start;
		if (Math.abs(dist) < 2) {
			scroller.scrollTop = dest;
			return;
		}
		const duration = 320;
		let startTs: number | null = null;
		const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
		const step = (ts: number) => {
			startTs ??= ts;
			const t = Math.min(1, (ts - startTs) / duration);
			scroller.scrollTop = start + dist * ease(t);
			if (t < 1) requestAnimationFrame(step);
			else computeActive();
		};
		requestAnimationFrame(step);
	}

	function scrollToHeading(index: number) {
		const el = headingEls()[index];
		if (!el) return;
		const scroller = scrollParentOf(el);
		if (!scroller) {
			el.scrollIntoView({ block: 'start' });
			return;
		}
		// Land the heading just below the sticky header band (matches its
		// scroll-margin-top in wiki-editor.css).
		const offset = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
		smoothScrollTo(scroller, scroller.scrollTop + offset - 76);
	}

	function onEditorReady(ed: Editor) {
		editor = ed;
		buildToc();
		// Collaborative content streams in after mount; rebuild once it has settled.
		setTimeout(buildToc, 400);
	}

	// Keep the active-section highlight current as the document scrolls. The
	// observer is a cheap trigger; the actual pick is done by computeActive.
	$effect(() => {
		void tocItems; // re-observe whenever the outline changes
		if (!showToc) return;
		const els = headingEls();
		if (!els.length) return;
		const io = new IntersectionObserver(computeActive, {
			rootMargin: '-96px 0px 0px 0px',
			threshold: [0, 1]
		});
		els.forEach((el) => io.observe(el));
		return () => io.disconnect();
	});

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
		tocItems = [];
		activeIndex = -1;
		tocCollapsed = false;
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

<svelte:head><title>{note.title || m.notes_untitled()}</title></svelte:head>

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
				<span class="flex items-center gap-1.5 text-[13px] text-text-3">
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
				<span class="text-[12px] text-text-3">{statusLabel}</span>
			{/if}

			<div class="h-4 w-px bg-border"></div>

			{#if canEdit}
				<IconButton ariaLabel={m.notes_bulk_tooltip()} onclick={openBulk}>
					<Icon name="check-square" size={15} />
				</IconButton>
			{/if}
			{#if isOwner}
				<IconButton ariaLabel={m.notes_share_title()} onclick={() => (shareOpen = true)}>
					<Icon name="link" size={15} />
				</IconButton>
			{/if}
			<div class="relative">
				<IconButton ariaLabel={m.notes_more()} onclick={() => (menuOpen = !menuOpen)}>
					<Icon name="settings" size={15} />
				</IconButton>
				<Popover open={menuOpen} onclose={() => (menuOpen = false)} align="right" minWidth={170}>
					<button
						type="button"
						onclick={() => void onSaveAsTemplate()}
						class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[14px] leading-none text-text-2 hover:bg-surface-2"
					>
						<span class="grid h-4 w-4 place-items-center"><Icon name="bookmark" size={14} /></span>
						<span>{m.notes_save_as_template()}</span>
					</button>
					{#if isOwner}
						<button
							type="button"
							onclick={() => void onDelete()}
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

	<div class="mx-auto max-w-[836px] px-8 pt-12 pb-28">
		<div class="mb-8 flex items-start gap-3.5">
			<span class="notes-doc__icon shrink-0">
				<Icon name={note.icon || 'file'} size={22} stroke={1.75} />
			</span>
			<input
				bind:value={titleDraft}
				maxlength="120"
				readonly={!canEdit}
				placeholder={m.notes_untitled()}
				oninput={onTitleInput}
				onblur={() => void saveTitle()}
				onkeydown={onTitleKeydown}
				class="w-full border-0 bg-transparent pt-1 text-[35px] leading-[1.12] font-semibold tracking-[-0.02em] text-text outline-none placeholder:text-text-4 read-only:cursor-default"
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
						onReady={onEditorReady}
						onUpdate={buildToc}
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
						class="absolute right-1 z-10 inline-flex h-6 items-center gap-1 rounded-md border border-border bg-bg-elev px-1.5 text-[12px] text-text-3 shadow-sm transition-colors hover:border-border-strong hover:text-text"
						style:top="{hoverTodoTop}px"
					>
						<Icon name="check-square" size={13} />
						{m.notes_todo_to_task_short()}
					</button>
				{/if}
			</div>
		{/if}
	</div>

	{#if showToc}
		<!-- Outline floats over the top-right of the note and sticks while you
		     scroll, so it's available at any width (rather than only when a wide
		     side gutter fits). Collapses to a compact chip. -->
		<aside class="pointer-events-none absolute inset-y-0 right-0 z-10 hidden sm:block">
			<div class="pointer-events-auto sticky top-[73px] mr-3 flex w-[216px] flex-col">
				{#if tocCollapsed}
					<button
						type="button"
						onclick={() => (tocCollapsed = false)}
						aria-label={m.notes_toc_title()}
						class="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-border bg-bg-elev/90 px-2.5 text-[12px] text-text-3 shadow-sm backdrop-blur transition-colors hover:border-border-strong hover:text-text"
					>
						<Icon name="list" size={14} />
						<span class="tabular-nums">{tocItems.length}</span>
					</button>
				{:else}
					<nav
						aria-label={m.notes_toc_title()}
						class="flex max-h-[calc(100vh-89px)] flex-col overflow-hidden rounded-xl border border-border bg-bg-elev/90 shadow-lg backdrop-blur"
					>
						<div class="flex items-center justify-between gap-2 py-2 pr-1.5 pl-3">
							<span class="text-[11px] font-semibold tracking-wide text-text-4 uppercase">
								{m.notes_toc_title()}
							</span>
							<button
								type="button"
								onclick={() => (tocCollapsed = true)}
								aria-label={m.notes_toc_title()}
								class="grid h-5 w-5 place-items-center rounded text-text-4 transition-colors hover:bg-surface-2 hover:text-text-2"
							>
								<Icon name="x" size={13} />
							</button>
						</div>
						<ul class="overflow-y-auto px-1.5 pb-2">
							{#each tocItems as item (item.index)}
								<li>
									<button
										type="button"
										onclick={() => scrollToHeading(item.index)}
										title={item.text}
										style:padding-left="{(item.level - 1) * 12 + 8}px"
										class="block w-full truncate rounded-md py-1 pr-2 text-left text-[13px] leading-snug transition-colors {activeIndex ===
										item.index
											? 'bg-surface-2 text-text'
											: 'text-text-3 hover:bg-surface-2/60 hover:text-text-2'}"
									>
										{item.text}
									</button>
								</li>
							{/each}
						</ul>
					</nav>
				{/if}
			</div>
		</aside>
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
