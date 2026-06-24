<script lang="ts">
	import { browser } from '$app/environment';
	import { invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import type { ActionResult } from '@sveltejs/kit';
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import IconButton from '$lib/components/IconButton.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Popover from '$lib/components/Popover.svelte';
	import { confirm } from '$lib/components/confirm.svelte';
	import { showToast } from '$lib/toast.svelte';
	import WikiEditor from '$lib/components/wiki/WikiEditor.svelte';
	import CollaborativeWikiEditor, {
		type PresenceUser
	} from '$lib/components/wiki/CollaborativeWikiEditor.svelte';
	import type { PageData } from './$types';
	import type { Editor } from '@tiptap/core';
	import type { WebSocketStatus } from '@hocuspocus/provider';
	import { m } from '$lib/paraglide/messages';

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
	const me = $derived(data.me);

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
		tree.filter((n) => n.parentId === pg.id).sort((a, b) => a.title.localeCompare(b.title))
	);

	let menuOpen = $state(false);
	let editor: Editor | undefined = $state();
	let collabStatus = $state<WebSocketStatus | undefined>(undefined);
	let presence = $state<PresenceUser[]>([]);

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
	const collabUser = $derived(
		me ? { name: me.name, color: userColor(me.id) } : { name: m.wiki_someone(), color: '#888' }
	);

	// Live collaborators other than me, de-duplicated by name (one person, many tabs).
	const others = $derived.by(() => {
		const out: PresenceUser[] = [];
		for (const u of presence) {
			if (u.isSelf || out.some((o) => o.name === u.name)) continue;
			out.push(u);
		}
		return out;
	});

	function relativeTime(d: Date | string): string {
		const dt = typeof d === 'string' ? new Date(d) : d;
		const diff = (Date.now() - dt.getTime()) / 1000;
		if (diff < 60) return m.wiki_relative_just_now();
		if (diff < 3600) return m.wiki_relative_min_ago({ n: Math.floor(diff / 60) });
		if (diff < 86400) return m.wiki_relative_hours_ago({ n: Math.floor(diff / 3600) });
		if (diff < 86400 * 7) return m.wiki_relative_days_ago({ n: Math.floor(diff / 86400) });
		return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	}
	function fmtDate(d: Date | string): string {
		const dt = typeof d === 'string' ? new Date(d) : d;
		return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	}

	// ─── Outline + scroll-spy (driven by the live editor) ───────────────────
	const outline = $state<{ items: { level: number; text: string }[] }>({ items: [] });
	let activeIdx = $state(-1);

	function headingEls(): HTMLElement[] {
		if (!editor) return [];
		return Array.from(editor.view.dom.querySelectorAll('h1, h2, h3'));
	}
	function rebuildOutline(ed?: Editor) {
		const e = ed ?? editor;
		if (!e) return (outline.items = []);
		const items: { level: number; text: string }[] = [];
		e.state.doc.descendants((node) => {
			if (node.type.name === 'heading' && node.textContent.trim()) {
				items.push({ level: node.attrs.level as number, text: node.textContent });
			}
		});
		outline.items = items;
		recomputeActive();
	}
	function recomputeActive() {
		const heads = headingEls();
		if (!heads.length) return (activeIdx = -1);
		let idx = 0;
		for (let i = 0; i < heads.length; i++) {
			if (heads[i].getBoundingClientRect().top - 140 <= 0) idx = i;
			else break;
		}
		activeIdx = idx;
	}
	function scrollToHeading(i: number) {
		headingEls()[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
	function onEditorReady(ed: Editor) {
		editor = ed;
		rebuildOutline(ed);
	}
	function onEditorUpdate(ed: Editor) {
		rebuildOutline(ed);
	}
	$effect(() => {
		if (!browser) return;
		// `true` capture also catches scroll inside the layout's scroll container.
		const onScroll = () => recomputeActive();
		window.addEventListener('scroll', onScroll, true);
		return () => window.removeEventListener('scroll', onScroll, true);
	});

	// ─── Title (always-editable inline; debounced autosave) ──────────────────
	let titleDraft = $state(pg.title);
	let titleSaving = $state(false);
	let titleTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		void pg.id;
		titleDraft = pg.title;
		collabStatus = undefined;
		presence = [];
	});

	async function saveTitle() {
		const title = titleDraft.trim();
		if (!title || title === pg.title) return;
		if (titleSaving) return;
		titleSaving = true;
		try {
			const fd = new FormData();
			fd.append('title', title);
			const res = await fetch(`/wiki/${pg.id}?/update`, {
				method: 'POST',
				body: fd,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result = deserialize(await res.text()) as ActionResult<
				{ success?: boolean },
				{ message?: string }
			>;
			if (result.type === 'failure') {
				showToast('err', result.data?.message ?? m.wiki_toast_could_not_rename());
				titleDraft = pg.title;
			} else if (result.type === 'success') {
				await invalidateAll();
			}
		} catch {
			showToast('err', m.wiki_toast_network_error());
		} finally {
			titleSaving = false;
		}
	}
	function onTitleInput() {
		clearTimeout(titleTimer);
		titleTimer = setTimeout(saveTitle, 800);
	}
	function onTitleBlur() {
		clearTimeout(titleTimer);
		void saveTitle();
	}
	function onTitleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			clearTimeout(titleTimer);
			void saveTitle();
			editor?.commands.focus('start');
		}
	}

	function copyLink() {
		if (!browser) return;
		navigator.clipboard?.writeText(location.href).then(
			() => showToast('ok', m.wiki_toast_link_copied()),
			() => showToast('err', m.wiki_toast_could_not_copy())
		);
	}

	let exporting = $state(false);
	async function onExportPdf() {
		if (!browser || !editor || exporting) return;
		menuOpen = false;
		exporting = true;
		const title = pg.title || m.wiki_untitled();
		const doc = editor.getJSON();
		try {
			const { exportWikiPageToPdf } = await import('$lib/wiki/pdf-export');
			await exportWikiPageToPdf(title, doc);
		} catch (e) {
			console.error('PDF export failed', e);
			showToast('err', m.wiki_toast_could_not_export());
		} finally {
			exporting = false;
		}
	}

	async function onDelete() {
		const ok = await confirm({
			title: pg.isFolder ? m.wiki_confirm_delete_folder_title() : m.wiki_confirm_delete_page_title(),
			message: pg.isFolder
				? m.wiki_confirm_delete_folder_message()
				: m.wiki_confirm_delete_page_message(),
			confirmLabel: m.common_delete(),
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
			showToast('ok', m.wiki_toast_deleted());
			window.location.href = result.location;
		} else if (result.type === 'success') {
			showToast('ok', m.wiki_toast_deleted());
			window.location.href = '/wiki';
		} else if (result.type === 'failure') {
			showToast('err', result.data?.message ?? m.wiki_toast_could_not_delete());
		} else {
			showToast('err', m.wiki_toast_could_not_delete());
		}
	}

	const statusLabel = $derived(
		collabStatus === 'connected'
			? m.wiki_status_live()
			: collabStatus === 'connecting'
				? m.wiki_status_connecting()
				: collabStatus === 'disconnected'
					? m.wiki_status_offline()
					: ''
	);
</script>

<svelte:head><title>{m.wiki_page_title({ title: pg.title })}</title></svelte:head>

<div class="wiki-doc relative min-h-full">
	<!-- Ambient warmth behind the header so the page reads as a crafted document. -->
	<div class="wiki-doc__glow" aria-hidden="true"></div>

	<header
		class="sticky top-0 z-20 flex items-center gap-3 px-8 h-[52px] border-b border-border/70 bg-bg/80 backdrop-blur-md"
	>
		<nav class="flex items-center gap-1.5 text-[12.5px] min-w-0">
			<a href="/wiki" class="text-text-3 hover:text-text transition-colors">{m.wiki_breadcrumb_root()}</a>
			{#each breadcrumbs as crumb, i (crumb.id)}
				<span class="text-text-4 select-none">/</span>
				{#if i === breadcrumbs.length - 1}
					<span class="text-text-2 font-medium truncate max-w-[240px]">{crumb.title}</span>
				{:else}
					<a
						href="/wiki/{crumb.id}"
						class="text-text-3 hover:text-text transition-colors truncate max-w-[160px]"
					>
						{crumb.title}
					</a>
				{/if}
			{/each}
		</nav>

		<div class="ml-auto flex items-center gap-3">
			<!-- Live collaborators -->
			{#if others.length > 0}
				<div class="flex items-center -space-x-1.5">
					{#each others.slice(0, 4) as u (u.clientId)}
						<span
							class="grid place-items-center rounded-full text-[9.5px] font-semibold text-white select-none"
							style:width="22px"
							style:height="22px"
							style:background={u.color}
							style:box-shadow="0 0 0 2px var(--bg), 0 0 0 3.5px {u.color}55"
							title={m.wiki_collaborators_now({ name: u.name })}
						>
							{initialsOf(u.name)}
						</span>
					{/each}
					{#if others.length > 4}
						<span
							class="grid place-items-center rounded-full bg-surface-2 text-text-3 text-[9.5px] font-semibold"
							style:width="22px"
							style:height="22px"
							style:box-shadow="0 0 0 2px var(--bg)"
						>
							+{others.length - 4}
						</span>
					{/if}
				</div>
			{/if}

			{#if statusLabel}
				<span class="wiki-status" data-state={collabStatus} title={m.wiki_sync_status_title()}>
					<span class="wiki-status__dot"></span>
					{statusLabel}
				</span>
			{/if}

			<div class="h-4 w-px bg-border"></div>

			<IconButton ariaLabel={m.wiki_aria_copy_link()} onclick={copyLink}><Icon name="link" size={14} /></IconButton>
			<div class="relative">
				<IconButton ariaLabel={m.wiki_aria_more()} onclick={() => (menuOpen = !menuOpen)}>
					<Icon name="settings" size={14} />
				</IconButton>
				<Popover open={menuOpen} onclose={() => (menuOpen = false)} align="right" minWidth={160}>
					{#if !pg.isFolder && editor}
						<button
							type="button"
							disabled={exporting}
							onclick={() => void onExportPdf()}
							class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-text-2 text-left text-[13px] leading-none disabled:opacity-50"
						>
							<span class="grid place-items-center w-4 h-4"><Icon name="download" size={13} /></span>
							<span>{exporting ? m.wiki_exporting() : m.wiki_export_pdf()}</span>
						</button>
					{/if}
					<button
						type="button"
						onclick={() => {
							menuOpen = false;
							void onDelete();
						}}
						class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-accent text-left text-[13px] leading-none"
					>
						<span class="grid place-items-center w-4 h-4"><Icon name="x" size={13} /></span>
						<span>{pg.isFolder ? m.wiki_delete_folder() : m.wiki_delete_page()}</span>
					</button>
				</Popover>
			</div>
		</div>
	</header>

	<div
		class="relative z-10 mx-auto max-w-[1080px] px-8 pt-12 pb-28 lg:grid lg:gap-14 lg:[grid-template-columns:minmax(0,1fr)_212px]"
	>
		<article class="min-w-0 max-w-[720px]">
			<!-- Document title block -->
			<div class="flex items-start gap-3.5 mb-5">
				<span class="wiki-doc__icon shrink-0">
					<Icon name={pg.isFolder ? 'folder' : 'file'} size={20} stroke={1.75} />
				</span>
				<input
					bind:value={titleDraft}
					maxlength="120"
					placeholder={m.wiki_untitled()}
					oninput={onTitleInput}
					onblur={onTitleBlur}
					onkeydown={onTitleKeydown}
					class="w-full bg-transparent border-0 outline-none text-[33px] font-semibold tracking-[-0.02em] text-text leading-[1.12] placeholder:text-text-4 pt-1"
				/>
			</div>

			<!-- Byline -->
			<div class="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[12.5px] text-text-3 mb-8 pl-[54px]">
				{#if updaterAvatar}
					<span class="flex items-center gap-2">
						<Avatar user={updaterAvatar} size={20} />
						<span>{m.wiki_byline_edited_by()} <span class="text-text-2 font-medium">{updatedBy?.name}</span></span>
					</span>
					<span class="text-text-4 select-none">·</span>
				{/if}
				<span>{m.wiki_byline_updated({ time: relativeTime(pg.updatedAt) })}</span>
			</div>

			<div class="h-px bg-gradient-to-r from-border to-transparent mb-8"></div>

			{#if browser && pg.documentId}
				{#key pg.documentId}
					<CollaborativeWikiEditor
						documentId={pg.documentId}
						pageId={pg.id}
						user={collabUser}
						placeholder={pg.isFolder ? m.wiki_placeholder_description() : m.wiki_placeholder_write_or_commands()}
						onUpdate={onEditorUpdate}
						onReady={onEditorReady}
						onStatus={(s) => (collabStatus = s)}
						onPresence={(u) => (presence = u)}
					/>
				{/key}
			{:else if pg.body}
				<WikiEditor content={pg.body} editable={false} />
			{/if}

			{#if pg.isFolder}
				{#if children.length > 0}
					<div class="mt-10">
						<div class="wiki-rail__label mb-3">{m.wiki_in_this_folder()}</div>
						<div class="grid gap-1.5">
							{#each children as child (child.id)}
								<a
									href="/wiki/{child.id}"
									class="group flex items-center gap-3 rounded-xl border border-border/70 bg-bg-elev/40 px-3.5 py-3 hover:border-border-strong hover:bg-surface transition-all"
								>
									<span
										class="grid place-items-center w-8 h-8 rounded-lg bg-surface text-text-3 group-hover:text-accent transition-colors"
									>
										<Icon name={child.isFolder ? 'folder' : 'file'} size={15} stroke={1.75} />
									</span>
									<span class="flex-1 truncate text-[13.5px] text-text-2 group-hover:text-text">
										{child.title}
									</span>
									<span
										class="text-text-4 -translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all"
									>
										<Icon name="chevron" size={14} />
									</span>
								</a>
							{/each}
						</div>
					</div>
				{:else if !pg.body}
					<div class="mt-8">
						<EmptyState
							icon="folder"
							title={m.wiki_folder_empty_title()}
							hint={m.wiki_folder_empty_hint()}
						/>
					</div>
				{/if}
			{/if}
		</article>

		<!-- Right rail -->
		<aside class="hidden lg:block">
			<div class="sticky top-[76px] space-y-7">
				{#if outline.items.length > 0}
					<nav>
						<div class="wiki-rail__label mb-3">{m.wiki_on_this_page()}</div>
						<ul class="space-y-0.5 border-l border-border">
							{#each outline.items as h, i (i + h.text)}
								<li>
									<button
										type="button"
										onclick={() => scrollToHeading(i)}
										class="wiki-toc-item {activeIdx === i ? 'is-active' : ''}"
										style:padding-left="{12 + (h.level - 1) * 12}px"
									>
										{h.text}
									</button>
								</li>
							{/each}
						</ul>
					</nav>
				{/if}

				<div>
					<div class="wiki-rail__label mb-3">{m.wiki_details()}</div>
					<dl class="space-y-2.5 text-[12.5px]">
						<div class="flex items-center justify-between gap-2">
							<dt class="text-text-4">{m.wiki_detail_type()}</dt>
							<dd class="flex items-center gap-1.5 text-text-2">
								<Icon name={pg.isFolder ? 'folder' : 'file'} size={12} />
								{pg.isFolder ? m.wiki_type_folder() : m.wiki_type_page()}
							</dd>
						</div>
						<div class="flex items-center justify-between gap-2">
							<dt class="text-text-4">{m.wiki_detail_created()}</dt>
							<dd class="text-text-2">{fmtDate(pg.createdAt)}</dd>
						</div>
						<div class="flex items-center justify-between gap-2">
							<dt class="text-text-4">{m.wiki_detail_updated()}</dt>
							<dd class="text-text-2">{fmtDate(pg.updatedAt)}</dd>
						</div>
					</dl>
				</div>
			</div>
		</aside>
	</div>
</div>

<style>
	.wiki-doc__glow {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 320px;
		pointer-events: none;
		background: radial-gradient(
			60% 130% at 18% -10%,
			color-mix(in oklab, var(--accent) 11%, transparent),
			transparent 70%
		);
		opacity: 0.7;
	}

	.wiki-doc__icon {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 12px;
		color: var(--accent);
		background: color-mix(in oklab, var(--accent) 12%, var(--bg-elev));
		border: 1px solid color-mix(in oklab, var(--accent) 22%, var(--border));
		box-shadow: 0 1px 0 rgba(255, 255, 255, 0.03) inset;
		margin-top: 2px;
	}

	/* Live status pill */
	.wiki-status {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 11.5px;
		font-weight: 500;
		letter-spacing: 0.01em;
		color: var(--text-3);
		user-select: none;
	}
	.wiki-status__dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--text-4);
	}
	.wiki-status[data-state='connected'] {
		color: #7fc8a9;
	}
	.wiki-status[data-state='connected'] .wiki-status__dot {
		background: #7fc8a9;
		box-shadow: 0 0 0 0 rgba(127, 200, 169, 0.5);
		animation: wiki-pulse 2.2s ease-out infinite;
	}
	.wiki-status[data-state='connecting'] {
		color: var(--color-status-paused, #e9c46a);
	}
	.wiki-status[data-state='connecting'] .wiki-status__dot {
		background: var(--color-status-paused, #e9c46a);
	}
	@keyframes wiki-pulse {
		0% {
			box-shadow: 0 0 0 0 rgba(127, 200, 169, 0.45);
		}
		70% {
			box-shadow: 0 0 0 5px rgba(127, 200, 169, 0);
		}
		100% {
			box-shadow: 0 0 0 0 rgba(127, 200, 169, 0);
		}
	}

	/* Right-rail micro labels */
	:global(.wiki-rail__label) {
		font-family: var(--font-mono);
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.13em;
		color: var(--text-4);
	}

	/* Table-of-contents items with an active marker on the rail line */
	.wiki-toc-item {
		position: relative;
		display: block;
		width: 100%;
		text-align: left;
		font-size: 12.5px;
		line-height: 1.35;
		padding-top: 4px;
		padding-bottom: 4px;
		color: var(--text-3);
		border-left: 1.5px solid transparent;
		margin-left: -1px;
		transition:
			color 0.15s,
			border-color 0.15s;
	}
	.wiki-toc-item:hover {
		color: var(--text);
	}
	.wiki-toc-item.is-active {
		color: var(--text);
		font-weight: 500;
		border-left-color: var(--accent);
	}
</style>
