<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { showToast } from '$lib/toast.svelte';
	import Icon from '../Icon.svelte';
	import Popover from '../Popover.svelte';

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

	let expanded = $state(new Set<string>());
	let search = $state('');
	let createOpen = $state(false);
	let createForId = $state<string | null>(null);

	function toggle(id: string) {
		const n = new Set(expanded);
		n.has(id) ? n.delete(id) : n.add(id);
		expanded = n;
	}

	const activeId = $derived(page.url.pathname.split('/').pop());

	const topLevel = $derived(childrenOf(null));

	const filtered = $derived.by(() => {
		const q = search.trim().toLowerCase();
		if (!q) return null;
		return new Set(
			tree.filter((n) => n.title.toLowerCase().includes(q)).map((n) => n.id)
		);
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
				showToast('err', data?.message ?? 'Could not move item.');
				return;
			}
			await invalidateAll();
		} catch {
			showToast('err', 'Could not move item.');
		}
	}
</script>

{#snippet row(p: Node, depth: number, matched: Set<string> | null)}
	{#if visible(p, matched)}
		{@const kids = childrenOf(p.id)}
		{@const hasKids = kids.length > 0}
		{@const isExpanded = expanded.has(p.id) || (matched !== null && hasKids)}
		{@const active = activeId === p.id}
		{@const dropping = dropTarget && dropTarget.id === p.id ? dropTarget.pos : null}
		{@const isDragging = draggingId === p.id}
		<div>
			<a
				href="/wiki/{p.id}"
				draggable="true"
				ondragstart={(e) => onRowDragStart(e, p)}
				ondragend={resetDrag}
				ondragover={(e) => onRowDragOver(e, p)}
				ondrop={(e) => onRowDrop(e, p)}
				class="group relative flex items-center gap-1.5 py-1 rounded-md hover:bg-surface transition-colors text-[13px] {active
					? 'bg-surface-2 text-text font-medium'
					: 'text-text-2'}"
				style:padding-left="{10 + depth * 14}px"
				style:padding-right="6px"
				style:opacity={isDragging ? 0.4 : 1}
				style:box-shadow={dropping === 'inside' ? 'inset 0 0 0 1px var(--accent)' : undefined}
				style:background-color={dropping === 'inside' ? 'var(--accent-soft)' : undefined}
			>
				{#if dropping === 'before' || dropping === 'after'}
					<span
						class="pointer-events-none absolute left-2 right-2 h-0.5 rounded-full"
						style:top={dropping === 'before' ? '-1px' : undefined}
						style:bottom={dropping === 'after' ? '-1px' : undefined}
						style:background-color="var(--accent)"
					></span>
				{/if}
				{#if hasKids}
					<button
						type="button"
						onclick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							toggle(p.id);
						}}
						class="w-3.5 h-3.5 grid place-items-center text-text-3 hover:text-text transition-transform {isExpanded
							? ''
							: '-rotate-90'}"
						aria-label="Toggle"
					>
						<Icon name="chevron" size={10} />
					</button>
				{:else}
					<span class="w-3.5"></span>
				{/if}
				<span class="text-text-3 {active ? 'text-accent' : ''}">
					<Icon name={p.icon} size={13} />
				</span>
				<span class="truncate flex-1">{p.title}</span>
				{#if p.isFolder}
					<span class="relative">
						<button
							type="button"
							onclick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								createForId = createForId === p.id ? null : p.id;
							}}
							class="opacity-0 group-hover:opacity-100 w-4 h-4 grid place-items-center rounded text-text-3 hover:text-text hover:bg-bg-elev transition {createForId ===
							p.id
								? 'opacity-100'
								: ''}"
							aria-label="Add inside this folder"
						>
							<Icon name="plus" size={11} />
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
								class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-text-2 hover:text-text text-left text-[13px] leading-none"
							>
								<span class="grid place-items-center w-4 h-4 text-text-3"><Icon name="book" size={13} /></span>
								<span>New page</span>
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
								class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-text-2 hover:text-text text-left text-[13px] leading-none"
							>
								<span class="grid place-items-center w-4 h-4 text-text-3"><Icon name="folder" size={13} /></span>
								<span>New folder</span>
							</button>
						</Popover>
					</span>
				{/if}
			</a>
			{#if hasKids && isExpanded}
				{#each kids as kid (kid.id)}
					{@render row(kid, depth + 1, matched)}
				{/each}
			{/if}
		</div>
	{/if}
{/snippet}

<aside class="border-r border-border bg-bg-elev flex flex-col min-h-0" style:width="260px">
	<div class="flex items-center px-4 pt-4 pb-2 relative">
		<span class="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-text-4">Wiki</span>
		<button
			onclick={() => (createOpen = !createOpen)}
			class="ml-auto w-6 h-6 grid place-items-center rounded-md text-text-3 hover:text-text hover:bg-surface transition-colors"
			aria-label="New"
		>
			<Icon name="plus" size={12} />
		</button>
		<Popover open={createOpen} onclose={() => (createOpen = false)} align="right" minWidth={180}>
			<button
				type="button"
				onclick={() => {
					createOpen = false;
					oncreate(null, false);
				}}
				class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-text-2 hover:text-text text-left text-[13px] leading-none"
			>
				<span class="grid place-items-center w-4 h-4 text-text-3"><Icon name="book" size={13} /></span>
				<span>New page</span>
			</button>
			<button
				type="button"
				onclick={() => {
					createOpen = false;
					oncreate(null, true);
				}}
				class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-text-2 hover:text-text text-left text-[13px] leading-none"
			>
				<span class="grid place-items-center w-4 h-4 text-text-3"><Icon name="folder" size={13} /></span>
				<span>New folder</span>
			</button>
		</Popover>
	</div>
	<div class="px-3 pb-3">
		<div class="flex items-center gap-2 bg-surface border border-border rounded-lg px-2.5 py-1.5 text-[12.5px]">
			<span class="text-text-3"><Icon name="search" size={12} /></span>
			<input
				type="text"
				bind:value={search}
				placeholder="Search pages…"
				class="bg-transparent border-0 outline-none flex-1 placeholder:text-text-3"
			/>
		</div>
	</div>
	<div class="flex-1 overflow-y-auto px-1.5 pb-3">
		{#if topLevel.length === 0}
			<div class="px-3 py-4 text-[12px] text-text-4">No pages yet.</div>
		{:else}
			{#each topLevel as p (p.id)}
				{@render row(p, 0, filtered)}
			{/each}
		{/if}
	</div>
</aside>
