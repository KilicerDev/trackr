<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import type { ActionResult } from '@sveltejs/kit';
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import Button from '$lib/components/Button.svelte';
	import IconButton from '$lib/components/IconButton.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Popover from '$lib/components/Popover.svelte';
	import { confirm } from '$lib/components/confirm.svelte';
	import { showToast } from '$lib/toast.svelte';
	import WikiEditor from '$lib/components/wiki/WikiEditor.svelte';
	import type { PageData } from './$types';
	import type { Editor } from '@tiptap/core';

	type TreeNode = {
		id: string;
		parentId: string | null;
		title: string;
		isFolder: boolean;
	};

	let { data }: { data: PageData } = $props();

	const pg = $derived(data.page);
	const authors = $derived(data.authors ?? []);
	const updatedBy = $derived(authors[0] ?? null);

	const tree = $derived(((page.data as { tree?: TreeNode[] }).tree ?? []) as TreeNode[]);
	const breadcrumbs = $derived.by(() => {
		const trail: TreeNode[] = [];
		let cur: TreeNode | undefined = tree.find((n) => n.id === pg.id);
		while (cur) {
			trail.unshift(cur);
			cur = cur.parentId ? tree.find((n) => n.id === cur!.parentId) : undefined;
		}
		return trail;
	});

	const children = $derived(
		tree
			.filter((n) => n.parentId === pg.id)
			.sort((a, b) => a.title.localeCompare(b.title))
	);

	let editing = $state(false);
	let titleDraft = $state(pg.title);
	let bodyDraft = $state(pg.body);
	let saving = $state(false);
	let menuOpen = $state(false);
	let editor: Editor | undefined = $state();

	$effect(() => {
		// Reset drafts when navigating between pages.
		void pg.id;
		titleDraft = pg.title;
		bodyDraft = pg.body;
		editing = false;
	});

	const outline = $state<{ items: { level: number; text: string; id: string }[] }>({ items: [] });
	function rebuildOutline() {
		if (!editor) return outline.items = [];
		const headings: { level: number; text: string; id: string }[] = [];
		editor.state.doc.descendants((node) => {
			if (node.type.name === 'heading') {
				const level = node.attrs.level as number;
				const text = node.textContent;
				if (text.trim()) {
					const id = text
						.toLowerCase()
						.replace(/[^a-z0-9\s-]/g, '')
						.trim()
						.replace(/\s+/g, '-');
					headings.push({ level, text, id });
				}
			}
		});
		outline.items = headings;
	}

	function onEditorReady(ed: Editor) {
		editor = ed;
		rebuildOutline();
	}
	function onEditorUpdate(html: string) {
		bodyDraft = html;
		rebuildOutline();
	}

	$effect(() => {
		// When body source changes (route change, save), refresh outline.
		void pg.body;
		rebuildOutline();
	});

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
	const updaterAvatar = $derived(
		updatedBy
			? { name: updatedBy.name, initials: initialsOf(updatedBy.name), color: userColor(updatedBy.id) }
			: undefined
	);

	function relativeTime(d: Date | string): string {
		const dt = typeof d === 'string' ? new Date(d) : d;
		const diff = (Date.now() - dt.getTime()) / 1000;
		if (diff < 60) return 'just now';
		if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
		if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
		if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} days ago`;
		return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	}
	function fmtDate(d: Date | string): string {
		const dt = typeof d === 'string' ? new Date(d) : d;
		return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function startEdit() {
		titleDraft = pg.title;
		bodyDraft = pg.body;
		editing = true;
		queueMicrotask(() => editor?.commands.focus('end'));
	}

	function cancelEdit() {
		titleDraft = pg.title;
		bodyDraft = pg.body;
		editing = false;
	}

	async function save() {
		const title = titleDraft.trim();
		if (!title) {
			showToast('err', 'Title cannot be empty');
			return;
		}
		if (saving) return;
		saving = true;

		try {
			const fd = new FormData();
			fd.append('title', title);
			fd.append('body', bodyDraft);
			const res = await fetch(`/wiki/${pg.id}?/update`, {
				method: 'POST',
				body: fd,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result = deserialize(await res.text()) as ActionResult<
				{ success?: boolean },
				{ message?: string }
			>;
			if (result.type === 'success') {
				showToast('ok', 'Saved');
				editing = false;
				await invalidateAll();
			} else if (result.type === 'failure') {
				showToast('err', result.data?.message ?? 'Could not save');
			} else {
				showToast('err', 'Could not save');
			}
		} catch {
			showToast('err', 'Network error');
		} finally {
			saving = false;
		}
	}

	function onTitleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			editor?.commands.focus('start');
		}
	}

	async function onDelete() {
		const ok = await confirm({
			title: pg.isFolder ? 'Delete folder?' : 'Delete page?',
			message: pg.isFolder
				? 'All pages inside this folder will also be deleted. This cannot be undone.'
				: 'This page will be permanently removed.',
			confirmLabel: 'Delete',
			tone: 'danger'
		});
		if (!ok) return;
		const fd = new FormData();
		const res = await fetch(`/wiki/${pg.id}?/delete`, {
			method: 'POST',
			body: fd,
			headers: { 'x-sveltekit-action': 'true' }
		});
		const result = deserialize(await res.text()) as ActionResult<
			Record<string, unknown>,
			{ message?: string }
		>;
		if (result.type === 'redirect') {
			showToast('ok', 'Deleted');
			window.location.href = result.location;
		} else if (result.type === 'success') {
			showToast('ok', 'Deleted');
			window.location.href = '/wiki';
		} else if (result.type === 'failure') {
			showToast('err', result.data?.message ?? 'Could not delete');
		} else {
			showToast('err', 'Could not delete');
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (!editing) return;
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault();
			void save();
		}
		if (e.key === 'Escape') {
			cancelEdit();
		}
	}
</script>

<svelte:head><title>Trackr · {pg.title}</title></svelte:head>
<svelte:window onkeydown={onKeydown} />

<div class="px-8 pt-6 pb-20 mx-auto max-w-[1100px]">
	<div class="flex items-center gap-2 mb-6 text-[12.5px]">
		<a href="/wiki" class="text-text-3 hover:text-text">Wiki</a>
		{#each breadcrumbs as crumb, i (crumb.id)}
			<span class="text-text-4">/</span>
			{#if i === breadcrumbs.length - 1}
				<span class="text-text font-medium truncate max-w-[260px]">{crumb.title}</span>
			{:else}
				<a href="/wiki/{crumb.id}" class="text-text-3 hover:text-text truncate max-w-[180px]">
					{crumb.title}
				</a>
			{/if}
		{/each}
		<div class="ml-auto flex items-center gap-1.5 relative">
			{#if editing}
				<Button variant="ghost" size="sm" onclick={cancelEdit}>Cancel</Button>
				<Button variant="primary" size="sm" onclick={save} disabled={saving}>
					{saving ? 'Saving…' : 'Save'}
				</Button>
			{:else}
				<IconButton ariaLabel="Copy link"><Icon name="link" size={14} /></IconButton>
				<IconButton ariaLabel="More" onclick={() => (menuOpen = !menuOpen)}>
					<Icon name="settings" size={14} />
				</IconButton>
				<Button variant="default" size="sm" onclick={startEdit}>Edit</Button>
				<Popover open={menuOpen} onclose={() => (menuOpen = false)} align="right" minWidth={160}>
					<button
						type="button"
						onclick={() => {
							menuOpen = false;
							void onDelete();
						}}
						class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-accent text-left text-[13px] leading-none"
					>
						<span class="grid place-items-center w-4 h-4"><Icon name="x" size={13} /></span>
						<span>Delete {pg.isFolder ? 'folder' : 'page'}</span>
					</button>
				</Popover>
			{/if}
		</div>
	</div>

	<div class="grid gap-12" style:grid-template-columns="minmax(0, 1fr) 220px">
		<article class="min-w-0">
			{#if editing}
				<input
					bind:value={titleDraft}
					maxlength="120"
					placeholder="Untitled"
					onkeydown={onTitleKeydown}
					class="w-full bg-transparent border-0 outline-none text-[34px] font-semibold tracking-[-0.014em] text-text mb-3 placeholder:text-text-4"
				/>
			{:else}
				<h1 class="text-[34px] font-semibold tracking-[-0.014em] text-text mb-3 leading-[1.15]">
					{pg.title}
				</h1>
			{/if}

			{#if updaterAvatar && !editing}
				<div class="flex items-center gap-2 text-[12px] text-text-3 mb-7">
					<Avatar user={updaterAvatar} size={20} />
					<span>Edited by <span class="text-text-2 font-medium">{updatedBy?.name}</span></span>
					<span class="text-text-4">·</span>
					<span>Updated {relativeTime(pg.updatedAt)}</span>
				</div>
			{/if}

			{#if editing || !pg.isFolder || pg.body}
				<WikiEditor
					content={editing ? bodyDraft : pg.body}
					editable={editing}
					placeholder={pg.isFolder ? 'Folder description (optional)…' : "Type '/' for commands…"}
					onUpdate={onEditorUpdate}
					onReady={onEditorReady}
				/>
			{/if}

			{#if pg.isFolder && !editing}
				{#if children.length > 0}
					<div class="mt-2">
						<div class="text-[11px] uppercase tracking-[0.08em] text-text-4 mb-3">
							In this folder
						</div>
						<div class="border-t border-border">
							{#each children as child (child.id)}
								<a
									href="/wiki/{child.id}"
									class="group flex items-center gap-3 py-2.5 border-b border-border hover:bg-surface transition-colors -mx-2 px-2 rounded-md"
								>
									<span class="text-text-3 group-hover:text-text">
										<Icon name={child.isFolder ? 'folder' : 'book'} size={15} />
									</span>
									<span class="text-[14px] text-text-2 group-hover:text-text flex-1 truncate">
										{child.title}
									</span>
									<span class="text-text-4 opacity-0 group-hover:opacity-100 transition-opacity">
										<Icon name="chevron" size={13} />
									</span>
								</a>
							{/each}
						</div>
					</div>
				{:else if !pg.body}
					<EmptyState
						icon="folder"
						title="This folder is empty"
						hint="Add a page or subfolder using the + next to it in the sidebar."
					/>
				{/if}
			{/if}
		</article>

		<aside class="hidden md:block sticky top-6 self-start">
			{#if outline.items.length > 0}
				<div class="text-[11px] uppercase tracking-[0.08em] text-text-4 mb-3">On this page</div>
				<div class="space-y-1.5 mb-6">
					{#each outline.items as h (h.id + h.text)}
						<a
							href="#{h.id}"
							class="block text-[12.5px] text-text-3 hover:text-text truncate"
							style:padding-left="{(h.level - 1) * 12}px"
						>
							{h.text}
						</a>
					{/each}
				</div>
			{/if}
			<div class="text-[11px] uppercase tracking-[0.08em] text-text-4 mb-3">Details</div>
			<dl class="space-y-2 text-[12.5px]">
				<div class="flex items-center justify-between gap-2">
					<dt class="text-text-3">Type</dt>
					<dd class="text-text-2">{pg.isFolder ? 'Folder' : 'Page'}</dd>
				</div>
				<div class="flex items-center justify-between gap-2">
					<dt class="text-text-3">Created</dt>
					<dd class="text-text-2">{fmtDate(pg.createdAt)}</dd>
				</div>
				<div class="flex items-center justify-between gap-2">
					<dt class="text-text-3">Updated</dt>
					<dd class="text-text-2">{fmtDate(pg.updatedAt)}</dd>
				</div>
			</dl>
		</aside>
	</div>
</div>
