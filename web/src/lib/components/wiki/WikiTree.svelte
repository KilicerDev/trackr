<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { showToast } from '$lib/stores/toast.svelte';
	import Icon from '../Icon.svelte';
	import Popover from '../Popover.svelte';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { readView, saveView } from '$lib/stores/view';
	import { m } from '$lib/paraglide/messages';

	type Node = {
		id: string;
		parentId: string | null;
		title: string;
		icon: string;
		isFolder: boolean;
		sortOrder: number;
	};

	interface Props {
		oncreate: (parentId: string | null, isFolder: boolean) => void;
	}
	let { oncreate }: Props = $props();

	const tree = $derived(((page.data as { tree?: Node[] }).tree ?? []) as Node[]);
	const childrenOf = $derived((parent: string | null): Node[] =>
		tree.filter((p) => p.parentId === parent)
	);

	// Persisted across reloads + devices via $lib/stores/view (same mechanism as
	// the /tasks view state). Hydrates from the local cache on init.
	let expanded = $state(new Set<string>(readView<{ expanded?: string[] }>('wiki').expanded ?? []));
	let search = $state('');

	// Persist the open/closed set on any change (toggle, drag-into-folder, create).
	// Uses the server-allowlisted 'wiki' view-state key so it syncs cross-device.
	$effect(() => {
		saveView('wiki', { expanded: [...expanded] });
	});
	let createOpen = $state(false);
	let createForId = $state<string | null>(null);

	function toggle(id: string) {
		const n = new Set(expanded);
		n.has(id) ? n.delete(id) : n.add(id);
		expanded = n;
	}

	const activeId = $derived(page.url.pathname.split('/').pop());

	const topLevel = $derived(childrenOf(null));
	const pageCount = $derived(tree.filter((n) => !n.isFolder).length);

	const filtered = $derived.by(() => {
		const q = search.trim().toLowerCase();
		if (!q) return null;
		return new Set(tree.filter((n) => n.title.toLowerCase().includes(q)).map((n) => n.id));
	});

	function visible(node: Node, matched: Set<string> | null): boolean {
		if (!matched) return true;
		if (matched.has(node.id)) return true;
		// keep ancestors of matched nodes
		const stack = [node.id];
		while (stack.length) {
			const cur = stack.pop()!;
			for (const n of tree) if (n.parentId === cur) stack.push(n.id);
			if (matched.has(cur)) return true;
		}
		return false;
	}

	// --- Drag & drop: reorder siblings + reparent into folders ---
	type Pos = 'before' | 'after' | 'inside';
	let draggingId = $state<string | null>(null);
	let dropTarget = $state<{ id: string; pos: Pos } | null>(null);

	function descendantsOf(id: string): Set<string> {
		const out = new Set<string>();
		const stack = [id];
		while (stack.length) {
			const cur = stack.pop()!;
			for (const n of tree)
				if (n.parentId === cur && !out.has(n.id)) {
					out.add(n.id);
					stack.push(n.id);
				}
		}
		return out;
	}

	function canDrop(targetId: string): boolean {
		if (!draggingId || targetId === draggingId) return false;
		return !descendantsOf(draggingId).has(targetId);
	}

	function resetDrag() {
		draggingId = null;
		dropTarget = null;
	}

	function onRowDragStart(e: DragEvent, p: Node) {
		draggingId = p.id;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', p.id);
		}
	}

	function onRowDragOver(e: DragEvent, p: Node) {
		if (!draggingId || !canDrop(p.id)) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const ratio = (e.clientY - rect.top) / rect.height;
		const pos: Pos = p.isFolder
			? ratio < 0.3
				? 'before'
				: ratio > 0.7
					? 'after'
					: 'inside'
			: ratio < 0.5
				? 'before'
				: 'after';
		if (!dropTarget || dropTarget.id !== p.id || dropTarget.pos !== pos) {
			dropTarget = { id: p.id, pos };
		}
	}

	async function onRowDrop(e: DragEvent, p: Node) {
		e.preventDefault();
		const dt = dropTarget;
		const dragId = draggingId;
		const valid =
			!!dragId && !!dt && dt.id === p.id && dragId !== p.id && !descendantsOf(dragId).has(p.id);
		resetDrag();
		if (!valid || !dragId || !dt) return;

		const newParentId = dt.pos === 'inside' ? p.id : p.parentId;
		const siblings = childrenOf(newParentId)
			.map((n) => n.id)
			.filter((sid) => sid !== dragId);
		if (dt.pos === 'inside') {
			siblings.push(dragId);
			expanded = new Set(expanded).add(p.id);
		} else {
			const idx = siblings.indexOf(p.id);
			siblings.splice(dt.pos === 'before' ? idx : idx + 1, 0, dragId);
		}

		try {
			const res = await fetch('/wiki/move', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id: dragId, parentId: newParentId, orderedIds: siblings })
			});
			if (!res.ok) {
				const data = await res.json().catch(() => null);
				showToast('err', data?.message ?? m.wiki_toast_could_not_move());
				return;
			}
			await invalidateAll();
		} catch {
			showToast('err', m.wiki_toast_could_not_move());
		}
	}

	// Indentation: each level adds a guide rail; rows align to a fixed icon column.
	const STEP = 17;
	const RAIL = 16; // x of the first guide / chevron column center
</script>

{#snippet row(p: Node, depth: number, matched: Set<string> | null)}
	{#if visible(p, matched)}
		{@const kids = childrenOf(p.id)}
		{@const hasKids = kids.length > 0}
		{@const isExpanded = expanded.has(p.id) || (matched !== null && hasKids)}
		{@const active = activeId === p.id}
		{@const dropping = dropTarget && dropTarget.id === p.id ? dropTarget.pos : null}
		{@const isDragging = draggingId === p.id}
		<div class="relative">
			<!-- Vertical guide rails for each ancestor level -->
			{#each Array(depth) as _, k (k)}
				<span class="tree-rail" style:left="{RAIL + k * STEP}px" aria-hidden="true"></span>
			{/each}

			<a
				href="/wiki/{p.id}"
				draggable="true"
				ondragstart={(e) => onRowDragStart(e, p)}
				ondragend={resetDrag}
				ondragover={(e) => onRowDragOver(e, p)}
				ondrop={(e) => onRowDrop(e, p)}
				class="tree-row group relative flex h-[34px] items-center rounded-lg {active
					? 'is-active'
					: ''} {p.isFolder ? 'is-folder' : ''}"
				style:padding-left="{8 + depth * STEP}px"
				style:padding-right="6px"
				style:opacity={isDragging ? 0.4 : 1}
				style:box-shadow={dropping === 'inside' ? 'inset 0 0 0 1px var(--accent)' : undefined}
				style:background-color={dropping === 'inside' ? 'var(--accent-soft)' : undefined}
			>
				{#if dropping === 'before' || dropping === 'after'}
					<span
						class="pointer-events-none absolute right-2 left-2 z-10 h-0.5 rounded-full"
						style:top={dropping === 'before' ? '-1px' : undefined}
						style:bottom={dropping === 'after' ? '-1px' : undefined}
						style:background-color="var(--accent)"
					></span>
				{/if}

				<!-- Chevron (folders only) — sits in a fixed-width column so icons align -->
				<span class="grid h-[18px] w-[18px] shrink-0 place-items-center">
					{#if hasKids}
						<button
							type="button"
							onclick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								toggle(p.id);
							}}
							class="tree-chevron grid h-[18px] w-[18px] place-items-center rounded-md text-text-4 transition-transform duration-150 {isExpanded
								? ''
								: '-rotate-90'}"
							aria-label={m.wiki_tree_toggle()}
						>
							<Icon name="chevron" size={11} />
						</button>
					{/if}
				</span>

				<span class="tree-icon mr-2 grid shrink-0 place-items-center">
					<Icon name={p.isFolder ? 'folder' : 'file'} size={16} stroke={1.75} />
				</span>

				<span class="tree-label min-w-0 flex-1 truncate text-[13.5px]">{p.title}</span>

				{#if p.isFolder}
					<span class="relative shrink-0">
						<button
							type="button"
							onclick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								createForId = createForId === p.id ? null : p.id;
							}}
							class="grid h-[22px] w-[22px] place-items-center rounded-md text-text-4 opacity-0 transition group-hover:opacity-100 hover:bg-bg-elev hover:text-text {createForId ===
							p.id
								? 'opacity-100'
								: ''}"
							aria-label={m.wiki_tree_add_inside_folder()}
						>
							<Icon name="plus" size={13} />
						</button>
						<Popover
							open={createForId === p.id}
							onclose={() => (createForId = null)}
							align="right"
							minWidth={180}
						>
							<button
								type="button"
								onclick={(e) => {
									e.preventDefault();
									e.stopPropagation();
									createForId = null;
									expanded = new Set(expanded).add(p.id);
									oncreate(p.id, false);
								}}
								class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] leading-none text-text-2 hover:bg-surface-2 hover:text-text"
							>
								<span class="grid h-4 w-4 place-items-center text-text-3"
									><Icon name="file" size={13} /></span
								>
								<span>{m.wiki_new_page()}</span>
							</button>
							<button
								type="button"
								onclick={(e) => {
									e.preventDefault();
									e.stopPropagation();
									createForId = null;
									expanded = new Set(expanded).add(p.id);
									oncreate(p.id, true);
								}}
								class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] leading-none text-text-2 hover:bg-surface-2 hover:text-text"
							>
								<span class="grid h-4 w-4 place-items-center text-text-3"
									><Icon name="folder" size={13} /></span
								>
								<span>{m.wiki_new_folder()}</span>
							</button>
						</Popover>
					</span>
				{/if}
			</a>
			{#if hasKids && isExpanded}
				<div transition:slide={{ duration: 180, easing: cubicOut }}>
					{#each kids as kid (kid.id)}
						{@render row(kid, depth + 1, matched)}
					{/each}
				</div>
			{/if}
		</div>
	{/if}
{/snippet}

<aside class="flex min-h-0 flex-col border-r border-border bg-bg-elev" style:width="260px">
	<div class="flex items-center gap-2 px-4 pt-4 pb-2.5">
		<span class="wiki-eyebrow">{m.wiki_breadcrumb_root()}</span>
		{#if pageCount > 0}
			<span class="wiki-count">{pageCount}</span>
		{/if}
		<div class="relative ml-auto">
			<button
				onclick={() => (createOpen = !createOpen)}
				class="grid h-[26px] w-[26px] place-items-center rounded-md text-text-3 transition-colors hover:bg-surface hover:text-text"
				aria-label={m.wiki_tree_new_page_or_folder()}
			>
				<Icon name="plus" size={14} />
			</button>
			<Popover open={createOpen} onclose={() => (createOpen = false)} align="right" minWidth={180}>
				<button
					type="button"
					onclick={() => {
						createOpen = false;
						oncreate(null, false);
					}}
					class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] leading-none text-text-2 hover:bg-surface-2 hover:text-text"
				>
					<span class="grid h-4 w-4 place-items-center text-text-3"
						><Icon name="file" size={13} /></span
					>
					<span>{m.wiki_new_page()}</span>
				</button>
				<button
					type="button"
					onclick={() => {
						createOpen = false;
						oncreate(null, true);
					}}
					class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] leading-none text-text-2 hover:bg-surface-2 hover:text-text"
				>
					<span class="grid h-4 w-4 place-items-center text-text-3"
						><Icon name="folder" size={13} /></span
					>
					<span>{m.wiki_new_folder()}</span>
				</button>
			</Popover>
		</div>
	</div>

	<div class="px-3 pb-2">
		<div class="wiki-search flex items-center gap-2 rounded-lg px-2.5 py-[6px] text-[12.5px]">
			<span class="text-text-4"><Icon name="search" size={13} /></span>
			<input
				type="text"
				bind:value={search}
				placeholder={m.wiki_tree_search_placeholder()}
				class="min-w-0 flex-1 border-0 bg-transparent outline-none placeholder:text-text-4"
			/>
		</div>
	</div>

	<div class="min-h-0 flex-1 overflow-y-auto px-2 pt-1 pb-4">
		{#if topLevel.length === 0}
			<div class="px-3 py-6 text-center text-[12.5px] text-text-4">{m.wiki_tree_no_pages()}</div>
		{:else}
			{#each topLevel as p (p.id)}
				{@render row(p, 0, filtered)}
			{/each}
		{/if}
	</div>
</aside>

<style>
	.wiki-eyebrow {
		font-family: var(--font-mono);
		font-size: 10.5px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.16em;
		color: var(--text-4);
	}
	.wiki-count {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--text-4);
		background: var(--surface);
		padding: 1px 6px;
		border-radius: 999px;
		line-height: 1.5;
	}

	.wiki-search {
		background: var(--bg);
		border: 1px solid var(--border);
		transition:
			border-color 0.15s,
			box-shadow 0.15s;
	}
	.wiki-search:focus-within {
		border-color: color-mix(in oklab, var(--accent) 40%, var(--border));
		box-shadow: 0 0 0 3px var(--accent-soft);
	}

	/* ── Rows ── */
	.tree-row {
		color: var(--text-2);
		transition:
			background-color 0.12s,
			color 0.12s;
	}
	.tree-icon {
		color: var(--text-4);
		transition: color 0.12s;
	}
	.tree-label {
		font-weight: 450;
	}
	/* Folders read a touch heavier so structure is legible at a glance. */
	.tree-row.is-folder .tree-icon,
	.tree-row.is-folder .tree-label {
		color: var(--text-2);
	}
	.tree-row.is-folder .tree-label {
		font-weight: 550;
	}

	.tree-row:not(.is-active):hover {
		background: var(--surface);
	}
	.tree-row:not(.is-active):hover .tree-label {
		color: var(--text);
	}
	.tree-row:not(.is-active):hover .tree-icon {
		color: var(--text-3);
	}

	/* Selection: neutral surface fill, coral icon. */
	.tree-row.is-active {
		background: var(--surface-2);
	}
	.tree-row.is-active .tree-label {
		color: var(--text);
		font-weight: 550;
	}
	.tree-row.is-active .tree-icon {
		color: var(--accent);
	}

	.tree-chevron:hover {
		color: var(--text-2);
		background: var(--surface);
	}

	/* ── Indent guide rails ── */
	.tree-rail {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--border);
		pointer-events: none;
	}
</style>
