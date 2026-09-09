<script lang="ts">
	// Notion-style notes sidebar: one scrolling column of collapsible sections
	// (Favorites, Recent, My notes as a nested tree, Shared with me, Meetings by
	// day) instead of two tabs. Section collapse + sub-note expansion persist per
	// user through the 'notes' view-state key (localStorage first, server sync).
	import { deserialize } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import type { ActionResult } from '@sveltejs/kit';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { SvelteSet } from 'svelte/reactivity';
	import Icon from '$lib/components/Icon.svelte';
	import Popover from '$lib/components/Popover.svelte';
	import { confirm } from '$lib/components/confirm.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import { readView, saveView } from '$lib/stores/view';
	import { m } from '$lib/paraglide/messages';

	type NoteItem = {
		id: string;
		kind: string;
		title: string;
		icon: string;
		pinned: boolean;
		parentId: string | null;
		sortOrder: number;
		updatedAt: Date | string;
		meetingDate?: Date | string | null;
		projectId: string | null;
	};
	type Project = { id: string; name: string; color: string };
	type SidebarState = { collapsed: string[]; expanded: string[] };
	type Section = 'favorites' | 'recent' | 'mine' | 'shared' | 'meetings';

	/** Ids of every ancestor of `id` (nearest first); empty when unknown or root. */
	function pathTo(id: string | undefined, notes: NoteItem[]): string[] {
		if (!id) return [];
		const lookup = new Map(notes.map((n) => [n.id, n]));
		const out: string[] = [];
		let cur = lookup.get(id);
		while (cur?.parentId && !out.includes(cur.parentId)) {
			out.push(cur.parentId);
			cur = lookup.get(cur.parentId);
		}
		return out;
	}

	let {
		mine,
		shared,
		meetings,
		initial = { collapsed: [], expanded: [] },
		onNewMeeting
	}: {
		mine: NoteItem[];
		shared: NoteItem[];
		meetings: NoteItem[];
		initial?: SidebarState;
		onNewMeeting: () => void;
	} = $props();

	const activeId = $derived(page.params.id ?? null);
	const projects = $derived(((page.data as { projects?: Project[] }).projects ?? []) as Project[]);
	const projectById = $derived(new Map(projects.map((p) => [p.id, p])));

	// ── Persisted UI state ──────────────────────────────────────────────────
	// SSR renders from the server copy; on the client the local mirror (written
	// on every change) wins so a revisit doesn't flash stale layout data.
	const local = readView<Partial<SidebarState>>('notes');
	// svelte-ignore state_referenced_locally
	const collapsed = new SvelteSet<string>(local.collapsed ?? initial.collapsed);
	// The open note's ancestors start expanded too, so a deep link renders its
	// path on the server instead of popping open after hydration.
	// svelte-ignore state_referenced_locally
	const expanded = new SvelteSet<string>([
		...(local.expanded ?? initial.expanded),
		...pathTo(page.params.id, mine)
	]);
	$effect(() => {
		saveView('notes', { collapsed: [...collapsed], expanded: [...expanded] });
	});

	function toggleSection(key: Section) {
		if (collapsed.has(key)) collapsed.delete(key);
		else collapsed.add(key);
	}
	function toggleExpand(id: string) {
		if (expanded.has(id)) expanded.delete(id);
		else expanded.add(id);
	}
	const isOpen = (key: Section) => !collapsed.has(key);

	// ── Tree ────────────────────────────────────────────────────────────────
	const childrenOf = $derived((parent: string | null): NoteItem[] =>
		mine.filter((n) => n.parentId === parent)
	);
	const roots = $derived(childrenOf(null));

	function ancestorsOf(id: string): string[] {
		return pathTo(id, mine);
	}
	function descendantsOf(id: string): Set<string> {
		// Plain Set: a throwaway lookup, never rendered.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const out = new Set<string>();
		const stack = [id];
		while (stack.length) {
			const cur = stack.pop()!;
			for (const n of mine)
				if (n.parentId === cur && !out.has(n.id)) {
					out.add(n.id);
					stack.push(n.id);
				}
		}
		return out;
	}

	// Reveal the open note: expand its ancestors when navigation lands on it.
	let lastRevealed = '';
	$effect(() => {
		const id = activeId;
		if (!id || id === lastRevealed) return;
		lastRevealed = id;
		for (const a of ancestorsOf(id)) expanded.add(a);
	});

	// ── Sections ────────────────────────────────────────────────────────────
	const favorites = $derived(mine.filter((n) => n.pinned));
	const recent = $derived.by(() => {
		const all = [...mine, ...shared, ...meetings];
		return all
			.filter((n, i) => all.findIndex((o) => o.id === n.id) === i)
			.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
			.slice(0, 5);
	});

	let search = $state('');
	const query = $derived(search.trim().toLowerCase());
	const matches = (n: NoteItem) => !query || (n.title || '').toLowerCase().includes(query);
	// Tree nodes to keep while searching: matches plus their ancestors (so the
	// path stays readable); null = no filter.
	const treeMatch = $derived.by(() => {
		if (!query) return null;
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const keep = new Set<string>();
		for (const n of mine)
			if (matches(n)) {
				keep.add(n.id);
				for (const a of ancestorsOf(n.id)) keep.add(a);
			}
		return keep;
	});

	// Meetings bucketed by day, newest day first (Apple Calendar list style).
	function startOfDay(d: Date): number {
		return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	}
	function dayLabel(d: Date): string {
		const today = startOfDay(new Date());
		const diffDays = Math.round((today - startOfDay(d)) / 86400000);
		if (diffDays === 0) return m.notes_day_today();
		if (diffDays === 1) return m.notes_day_yesterday();
		if (diffDays === -1) return m.notes_day_tomorrow();
		return d.toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {})
		});
	}
	const meetingGroups = $derived.by(() => {
		const rows = meetings
			.filter(matches)
			.map((n) => ({ n, t: n.meetingDate ? new Date(n.meetingDate).getTime() : 0 }))
			.sort((a, b) => b.t - a.t);
		const out: { key: string; label: string; items: NoteItem[] }[] = [];
		for (const { n, t } of rows) {
			const key = t ? String(startOfDay(new Date(t))) : 'none';
			let g = out.find((x) => x.key === key);
			if (!g) {
				g = { key, label: t ? dayLabel(new Date(t)) : m.notes_no_date(), items: [] };
				out.push(g);
			}
			g.items.push(n);
		}
		return out;
	});

	// ── Actions ─────────────────────────────────────────────────────────────
	let creating = $state(false);
	let createOpen = $state(false);
	let menuFor = $state<string | null>(null);

	async function action(path: string, fd: FormData): Promise<ActionResult> {
		const res = await fetch(path, {
			method: 'POST',
			body: fd,
			headers: { 'x-sveltekit-action': 'true' }
		});
		return deserialize(await res.text()) as ActionResult;
	}

	async function createNote(parentId: string | null) {
		if (creating) return;
		creating = true;
		createOpen = false;
		menuFor = null;
		try {
			const fd = new FormData();
			if (parentId) fd.set('parentId', parentId);
			const result = await action('/notes?/create', fd);
			if (result.type === 'success' && result.data?.id) {
				if (parentId) expanded.add(parentId);
				await goto(`/notes/${result.data.id}`, { invalidateAll: true });
			} else {
				showToast('err', m.notes_toast_create_failed());
			}
		} catch {
			showToast('err', m.notes_toast_create_failed());
		} finally {
			creating = false;
		}
	}

	async function togglePin(id: string, pinned: boolean) {
		menuFor = null;
		const fd = new FormData();
		fd.set('id', id);
		fd.set('pinned', String(!pinned));
		await action('/notes?/pin', fd);
		await invalidateAll();
	}

	async function deleteNote(n: NoteItem) {
		menuFor = null;
		const subtree = descendantsOf(n.id);
		const ok = await confirm({
			title: m.notes_confirm_delete_title(),
			message: subtree.size
				? m.notes_confirm_delete_subtree_message({ n: subtree.size })
				: m.notes_confirm_delete_message(),
			confirmLabel: m.common_delete(),
			tone: 'danger'
		});
		if (!ok) return;
		const result = await action(`/notes/${n.id}?/delete`, new FormData());
		if (result.type === 'redirect' || result.type === 'success') {
			showToast('ok', m.notes_toast_deleted());
			if (activeId && (activeId === n.id || subtree.has(activeId))) {
				await goto('/notes', { invalidateAll: true });
			} else {
				await invalidateAll();
			}
		} else {
			showToast('err', m.notes_toast_delete_failed());
		}
	}

	// ── Drag & drop (My notes only): reorder siblings or nest under a note ──
	type Pos = 'before' | 'after' | 'inside';
	let draggingId = $state<string | null>(null);
	let dropTarget = $state<{ id: string; pos: Pos } | null>(null);

	function canDrop(targetId: string): boolean {
		if (!draggingId || targetId === draggingId) return false;
		return !descendantsOf(draggingId).has(targetId);
	}
	function resetDrag() {
		draggingId = null;
		dropTarget = null;
	}
	function onRowDragStart(e: DragEvent, n: NoteItem) {
		draggingId = n.id;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', n.id);
		}
	}
	function onRowDragOver(e: DragEvent, n: NoteItem) {
		if (!draggingId || !canDrop(n.id)) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const ratio = (e.clientY - rect.top) / rect.height;
		// Any note can hold sub-notes: the middle band nests, the edges reorder.
		const pos: Pos = ratio < 0.28 ? 'before' : ratio > 0.72 ? 'after' : 'inside';
		if (!dropTarget || dropTarget.id !== n.id || dropTarget.pos !== pos) {
			dropTarget = { id: n.id, pos };
		}
	}
	async function onRowDrop(e: DragEvent, n: NoteItem) {
		e.preventDefault();
		const dt = dropTarget;
		const dragId = draggingId;
		const valid = !!dragId && !!dt && dt.id === n.id && canDrop(n.id);
		resetDrag();
		if (!valid || !dragId || !dt) return;

		const newParentId = dt.pos === 'inside' ? n.id : n.parentId;
		const siblings = childrenOf(newParentId)
			.map((s) => s.id)
			.filter((sid) => sid !== dragId);
		if (dt.pos === 'inside') {
			siblings.push(dragId);
			expanded.add(n.id);
		} else {
			const idx = siblings.indexOf(n.id);
			siblings.splice(dt.pos === 'before' ? idx : idx + 1, 0, dragId);
		}
		try {
			const res = await fetch('/notes/move', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id: dragId, parentId: newParentId, orderedIds: siblings })
			});
			if (!res.ok) {
				const data = await res.json().catch(() => null);
				showToast('err', data?.message ?? m.notes_toast_could_not_move());
				return;
			}
			await invalidateAll();
		} catch {
			showToast('err', m.notes_toast_could_not_move());
		}
	}

	const STEP = 14; // px per nesting level
	const stop = (e: Event) => {
		e.preventDefault();
		e.stopPropagation();
	};
</script>

<!-- Section header: label toggles collapse; optional "+" appears on hover. -->
{#snippet sectionHead(key: Section, label: string, onadd?: () => void, addLabel?: string)}
	<div class="sec group/sec flex h-[30px] items-center pr-1 pl-1">
		<button
			type="button"
			onclick={() => toggleSection(key)}
			class="sec-toggle flex h-full min-w-0 flex-1 items-center gap-1 rounded-md pr-1 pl-1.5 text-left"
			aria-expanded={isOpen(key)}
			aria-label={m.notes_section_toggle()}
		>
			<span class="sec-label truncate">{label}</span>
			<span
				class="sec-chevron grid h-4 w-4 shrink-0 place-items-center transition-transform duration-150 {isOpen(
					key
				)
					? ''
					: '-rotate-90'}"
			>
				<Icon name="chevron" size={11} />
			</span>
		</button>
		{#if onadd}
			<button
				type="button"
				onclick={onadd}
				class="sec-add grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md"
				aria-label={addLabel}
				title={addLabel}
			>
				<Icon name="plus" size={13} />
			</button>
		{/if}
	</div>
{/snippet}

<!-- Flat row (favorites, recent, shared, meetings). -->
{#snippet flatRow(
	n: NoteItem,
	opts: { sub?: string | null; subColor?: string | null; trail?: string }
)}
	<a
		href="/notes/{n.id}"
		class="nrow group flex min-h-[30px] items-center gap-2 rounded-md px-2 {activeId === n.id
			? 'is-active'
			: ''}"
		style:padding-left="{8 + STEP}px"
	>
		<span class="nrow-icon grid h-[18px] w-[18px] shrink-0 place-items-center">
			<Icon name={n.icon || (n.kind === 'meeting' ? 'users' : 'file')} size={15} stroke={1.75} />
		</span>
		<span class="min-w-0 flex-1 py-[5px]">
			<span class="nrow-label block truncate">{n.title || m.notes_untitled()}</span>
			{#if opts.sub}
				<span class="mt-px flex items-center gap-1.5 text-[12px] text-text-4">
					{#if opts.subColor}
						<span class="h-2 w-2 shrink-0 rounded-[2.5px]" style:background={opts.subColor}></span>
					{/if}
					<span class="truncate">{opts.sub}</span>
				</span>
			{/if}
		</span>
		{#if opts.trail}
			<Icon name={opts.trail} size={12} class="shrink-0 text-text-4" />
		{/if}
	</a>
{/snippet}

<!-- Tree row (My notes): hover swaps the icon for a chevron when the note has
     sub-notes and reveals "…" + "+" on the right, like Notion's page tree. -->
{#snippet treeRow(n: NoteItem, depth: number)}
	{#if !treeMatch || treeMatch.has(n.id)}
		{@const kids = childrenOf(n.id)}
		{@const hasKids = kids.length > 0}
		{@const open = expanded.has(n.id) || (treeMatch !== null && hasKids)}
		{@const dropping = dropTarget && dropTarget.id === n.id ? dropTarget.pos : null}
		<div class="relative">
			<a
				href="/notes/{n.id}"
				draggable="true"
				ondragstart={(e) => onRowDragStart(e, n)}
				ondragend={resetDrag}
				ondragover={(e) => onRowDragOver(e, n)}
				ondrop={(e) => onRowDrop(e, n)}
				class="nrow group relative flex h-[30px] items-center gap-1.5 rounded-md pr-1 {activeId ===
				n.id
					? 'is-active'
					: ''} {hasKids ? 'has-kids' : ''} {menuFor === n.id ? 'menu-open' : ''}"
				style:padding-left="{8 + depth * STEP}px"
				style:opacity={draggingId === n.id ? 0.4 : 1}
				style:box-shadow={dropping === 'inside' ? 'inset 0 0 0 1px var(--accent)' : undefined}
				style:background-color={dropping === 'inside' ? 'var(--accent-soft)' : undefined}
			>
				{#if dropping === 'before' || dropping === 'after'}
					<span
						class="pointer-events-none absolute right-2 z-10 h-0.5 rounded-full"
						style:left="{8 + depth * STEP}px"
						style:top={dropping === 'before' ? '-1px' : undefined}
						style:bottom={dropping === 'after' ? '-1px' : undefined}
						style:background-color="var(--accent)"
					></span>
				{/if}

				<span class="nrow-lead relative grid h-[22px] w-[22px] shrink-0 place-items-center">
					<span class="nrow-icon grid place-items-center">
						<Icon name={n.icon || 'file'} size={15} stroke={1.75} />
					</span>
					{#if hasKids}
						<button
							type="button"
							onclick={(e) => {
								stop(e);
								toggleExpand(n.id);
							}}
							class="nrow-chevron absolute inset-0 grid place-items-center rounded-md transition-transform duration-150 {open
								? ''
								: '-rotate-90'}"
							aria-label={m.notes_tree_toggle()}
							aria-expanded={open}
						>
							<Icon name="chevron" size={13} />
						</button>
					{/if}
				</span>

				<span class="nrow-label min-w-0 flex-1 truncate">{n.title || m.notes_untitled()}</span>

				<span class="nrow-actions flex shrink-0 items-center gap-px">
					<span class="relative">
						<button
							type="button"
							onclick={(e) => {
								stop(e);
								menuFor = menuFor === n.id ? null : n.id;
							}}
							class="nrow-btn grid h-[22px] w-[22px] place-items-center rounded-md"
							aria-label={m.notes_more()}
							title={m.notes_more()}
						>
							<Icon name="more" size={14} />
						</button>
						<Popover
							open={menuFor === n.id}
							onclose={() => (menuFor = null)}
							align="right"
							minWidth={190}
						>
							<button
								type="button"
								onclick={(e) => {
									stop(e);
									void togglePin(n.id, n.pinned);
								}}
								class="menu-item"
							>
								<span class="grid h-4 w-4 place-items-center text-text-3">
									<Icon name="star" size={14} class={n.pinned ? 'fill-current text-accent' : ''} />
								</span>
								<span>{n.pinned ? m.notes_unpin() : m.notes_pin()}</span>
							</button>
							<button
								type="button"
								onclick={(e) => {
									stop(e);
									void createNote(n.id);
								}}
								class="menu-item"
							>
								<span class="grid h-4 w-4 place-items-center text-text-3">
									<Icon name="plus" size={14} />
								</span>
								<span>{m.notes_new_subnote()}</span>
							</button>
							<div class="my-1 border-t border-border"></div>
							<button
								type="button"
								onclick={(e) => {
									stop(e);
									void deleteNote(n);
								}}
								class="menu-item text-accent"
							>
								<span class="grid h-4 w-4 place-items-center">
									<Icon name="trash" size={14} />
								</span>
								<span>{m.notes_delete()}</span>
							</button>
						</Popover>
					</span>
					<button
						type="button"
						onclick={(e) => {
							stop(e);
							void createNote(n.id);
						}}
						class="nrow-btn grid h-[22px] w-[22px] place-items-center rounded-md"
						aria-label={m.notes_new_subnote()}
						title={m.notes_new_subnote()}
					>
						<Icon name="plus" size={14} />
					</button>
				</span>
			</a>
			{#if hasKids && open}
				<div transition:slide={{ duration: 160, easing: cubicOut }}>
					{#each kids as kid (kid.id)}
						{@render treeRow(kid, depth + 1)}
					{/each}
				</div>
			{/if}
		</div>
	{/if}
{/snippet}

<aside
	class="flex min-h-0 w-[286px] flex-col border-r border-border bg-bg-elev max-md:w-full max-md:border-r-0"
>
	<!-- Header: eyebrow + count + create menu -->
	<div class="flex items-center gap-2 px-4 pt-4 pb-2">
		<span class="eyebrow">{m.shell_nav_notes()}</span>
		{#if mine.length > 0}
			<span class="count">{mine.length}</span>
		{/if}
		<div class="relative ml-auto">
			<button
				type="button"
				onclick={() => (createOpen = !createOpen)}
				disabled={creating}
				class="grid h-[29px] w-[29px] place-items-center rounded-md text-text-3 transition-colors hover:bg-surface hover:text-text disabled:opacity-50"
				aria-label={m.notes_new_note()}
				title={m.notes_new_note()}
			>
				<Icon name="plus" size={15} />
			</button>
			<Popover open={createOpen} onclose={() => (createOpen = false)} align="right" minWidth={200}>
				<button type="button" onclick={() => void createNote(null)} class="menu-item">
					<span class="grid h-4 w-4 place-items-center text-text-3"
						><Icon name="file" size={14} /></span
					>
					<span>{m.notes_new_note()}</span>
				</button>
				<button
					type="button"
					onclick={() => {
						createOpen = false;
						onNewMeeting();
					}}
					class="menu-item"
				>
					<span class="grid h-4 w-4 place-items-center text-text-3"
						><Icon name="users" size={14} /></span
					>
					<span>{m.notes_new_meeting()}</span>
				</button>
			</Popover>
		</div>
	</div>

	<div class="px-3 pb-1">
		<div class="search flex items-center gap-2 rounded-lg px-2.5 py-[6px] text-[14px]">
			<span class="text-text-4"><Icon name="search" size={14} /></span>
			<input
				type="text"
				bind:value={search}
				placeholder={m.notes_tree_search_placeholder()}
				class="min-w-0 flex-1 border-0 bg-transparent outline-none placeholder:text-text-4"
			/>
		</div>
	</div>

	<div class="min-h-0 flex-1 overflow-y-auto px-2 pt-1 pb-4">
		<!-- Favorites -->
		{#if favorites.some(matches)}
			<div class="pt-2">
				{@render sectionHead('favorites', m.notes_section_favorites())}
				{#if isOpen('favorites')}
					<div transition:slide={{ duration: 160, easing: cubicOut }}>
						{#each favorites.filter(matches) as n (n.id)}
							{@render flatRow(n, {})}
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Recent (hidden while searching — the other sections filter instead) -->
		{#if !query && recent.length > 1}
			<div class="pt-2">
				{@render sectionHead('recent', m.notes_section_recent())}
				{#if isOpen('recent')}
					<div transition:slide={{ duration: 160, easing: cubicOut }}>
						{#each recent as n (n.id)}
							{@render flatRow(n, {})}
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- My notes: the tree -->
		<div class="pt-2">
			{@render sectionHead(
				'mine',
				m.notes_section_mine(),
				() => void createNote(null),
				m.notes_new_note()
			)}
			{#if isOpen('mine')}
				<div transition:slide={{ duration: 160, easing: cubicOut }}>
					{#each roots as n (n.id)}
						{@render treeRow(n, 0)}
					{/each}
					{#if query && treeMatch && treeMatch.size === 0}
						<div class="px-3 py-1.5 text-[13px] text-text-4">{m.notes_sidebar_empty()}</div>
					{:else if !query}
						<button
							type="button"
							onclick={() => void createNote(null)}
							disabled={creating}
							class="ghost flex h-[30px] w-full items-center gap-2 rounded-md px-2 text-[14px] disabled:opacity-50"
							style:padding-left="{8 + 2}px"
						>
							<span class="grid h-[22px] w-[22px] place-items-center"
								><Icon name="plus" size={14} /></span
							>
							<span>{m.notes_add_note_row()}</span>
						</button>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Shared with me -->
		{#if shared.some(matches)}
			<div class="pt-2">
				{@render sectionHead('shared', m.notes_shared_with_me())}
				{#if isOpen('shared')}
					<div transition:slide={{ duration: 160, easing: cubicOut }}>
						{#each shared.filter(matches) as n (n.id)}
							{@render flatRow(n, { trail: 'link' })}
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Meetings, grouped by day -->
		<div class="pt-2">
			{@render sectionHead(
				'meetings',
				m.notes_section_meetings(),
				onNewMeeting,
				m.notes_new_meeting()
			)}
			{#if isOpen('meetings')}
				<div transition:slide={{ duration: 160, easing: cubicOut }}>
					{#each meetingGroups as g (g.key)}
						<div class="day-label px-2 pt-2 pb-0.5 text-[12px]" style:padding-left="{8 + STEP}px">
							{g.label}
						</div>
						{#each g.items as n (n.id)}
							{@const proj = n.projectId ? projectById.get(n.projectId) : null}
							{@render flatRow(n, { sub: proj?.name ?? null, subColor: proj?.color ?? null })}
						{/each}
					{/each}
					{#if meetingGroups.length === 0}
						<div class="px-3 py-1.5 text-[13px] text-text-4">
							{m.notes_meetings_sidebar_empty()}
						</div>
					{/if}
					{#if !query}
						<button
							type="button"
							onclick={onNewMeeting}
							class="ghost flex h-[30px] w-full items-center gap-2 rounded-md px-2 text-[14px]"
							style:padding-left="{8 + 2}px"
						>
							<span class="grid h-[22px] w-[22px] place-items-center"
								><Icon name="plus" size={14} /></span
							>
							<span>{m.notes_new_meeting()}</span>
						</button>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<!-- Footer: templates -->
	<div class="border-t border-border px-2 py-2">
		<a
			href="/notes/templates"
			class="nrow flex h-[30px] items-center gap-2 rounded-md px-2 {page.url.pathname ===
			'/notes/templates'
				? 'is-active'
				: ''}"
		>
			<span class="nrow-icon grid h-[18px] w-[18px] place-items-center">
				<Icon name="bookmark" size={14} />
			</span>
			<span class="nrow-label">{m.notes_templates_title()}</span>
		</a>
	</div>
</aside>

<style>
	.eyebrow {
		font-family: var(--font-mono);
		font-size: 10.5px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.16em;
		color: var(--text-4);
	}
	.count {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--text-4);
		background: var(--surface);
		padding: 1px 6px;
		border-radius: 999px;
		line-height: 1.5;
	}
	.search {
		background: var(--bg);
		border: 1px solid var(--border);
		transition:
			border-color 0.15s,
			box-shadow 0.15s;
	}
	.search:focus-within {
		border-color: color-mix(in oklab, var(--accent) 40%, var(--border));
		box-shadow: 0 0 0 3px var(--accent-soft);
	}

	/* ── Section headers ── */
	.sec-label {
		font-size: 12px;
		font-weight: 550;
		color: var(--text-4);
		transition: color 0.12s;
	}
	.sec-toggle:hover .sec-label,
	.sec-toggle:focus-visible .sec-label {
		color: var(--text-2);
	}
	.sec-chevron {
		color: var(--text-4);
		opacity: 0;
		transition:
			opacity 0.12s,
			transform 0.15s;
	}
	.sec:hover .sec-chevron,
	.sec-toggle:focus-visible .sec-chevron {
		opacity: 1;
	}
	.sec-add {
		color: var(--text-4);
		opacity: 0;
		transition:
			opacity 0.12s,
			background-color 0.12s,
			color 0.12s;
	}
	.sec:hover .sec-add,
	.sec-add:focus-visible {
		opacity: 1;
	}
	.sec-add:hover {
		background: var(--surface);
		color: var(--text);
	}

	/* ── Rows ── */
	.nrow {
		color: var(--text-2);
		font-size: 14px;
		transition:
			background-color 0.12s,
			color 0.12s;
	}
	.nrow-icon {
		color: var(--text-4);
		transition: color 0.12s;
	}
	.nrow-label {
		font-weight: 450;
	}
	.nrow:not(.is-active):hover,
	.nrow.menu-open {
		background: var(--surface);
	}
	.nrow:hover .nrow-label {
		color: var(--text);
	}
	.nrow:hover .nrow-icon {
		color: var(--text-3);
	}
	.nrow.is-active {
		background: var(--surface-2);
	}
	.nrow.is-active .nrow-label {
		color: var(--text);
		font-weight: 550;
	}
	.nrow.is-active .nrow-icon {
		color: var(--accent);
	}

	/* Chevron takes the icon's place on hover (only when there are sub-notes). */
	.nrow-chevron {
		color: var(--text-3);
		opacity: 0;
		transition:
			opacity 0.12s,
			transform 0.15s,
			background-color 0.12s;
	}
	.nrow.has-kids:hover .nrow-icon,
	.nrow.has-kids:focus-within .nrow-icon {
		opacity: 0;
	}
	.nrow.has-kids:hover .nrow-chevron,
	.nrow.has-kids:focus-within .nrow-chevron {
		opacity: 1;
	}
	.nrow-chevron:hover {
		background: var(--surface-2);
		color: var(--text);
	}

	/* Hover-only actions on the right. */
	.nrow-actions {
		opacity: 0;
		transition: opacity 0.12s;
	}
	.nrow:hover .nrow-actions,
	.nrow:focus-within .nrow-actions,
	.nrow.menu-open .nrow-actions {
		opacity: 1;
	}
	.nrow-btn {
		color: var(--text-4);
		transition:
			background-color 0.12s,
			color 0.12s;
	}
	.nrow-btn:hover {
		background: var(--surface-2);
		color: var(--text);
	}

	.ghost {
		color: var(--text-4);
		transition:
			background-color 0.12s,
			color 0.12s;
	}
	.ghost:hover {
		background: var(--surface);
		color: var(--text-2);
	}

	.day-label {
		color: var(--text-3);
		font-weight: 500;
	}

	.menu-item {
		display: flex;
		width: 100%;
		align-items: center;
		gap: 10px;
		border-radius: 6px;
		padding: 6px 8px;
		text-align: left;
		font-size: 14px;
		line-height: 1;
		color: var(--text-2);
		transition:
			background-color 0.12s,
			color 0.12s;
	}
	.menu-item:hover {
		background: var(--surface-2);
		color: var(--text);
	}
	.menu-item.text-accent,
	.menu-item.text-accent:hover {
		color: var(--accent);
	}
</style>
