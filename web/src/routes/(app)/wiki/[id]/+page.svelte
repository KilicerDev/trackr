<script lang="ts">
	import { formatDate } from '$lib/utils/format';
	import { pageTitle } from '$lib/brand';
	import { browser } from '$app/environment';
	import { invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import type { ActionResult } from '@sveltejs/kit';
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import DocOutline from '$lib/components/wiki/DocOutline.svelte';
	import MobileMenuButton from '$lib/components/shell/MobileMenuButton.svelte';
	import SyncStatus from '$lib/components/SyncStatus.svelte';
	import { autosize } from '$lib/actions/autosize';
	import IconButton from '$lib/components/IconButton.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Popover from '$lib/components/Popover.svelte';
	import { confirm } from '$lib/components/confirm.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
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
			? {
					name: updatedBy.name,
					initials: initialsOf(updatedBy.name),
					color: userColor(updatedBy.id)
				}
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
		return formatDate(dt);
	}
	function fmtDate(d: Date | string): string {
		const dt = typeof d === 'string' ? new Date(d) : d;
		return formatDate(dt);
	}

	// ─── Outline: see DocOutline ─────────────────────────────────────────────
	let editorWrap = $state<HTMLElement>();
	let tocRev = $state(0);
	function onEditorReady(ed: Editor) {
		editor = ed;
		tocRev++;
	}

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
		// Single line: a pasted line break becomes a space.
		if (/[\r\n]/.test(titleDraft)) titleDraft = titleDraft.replace(/[\r\n]+/g, ' ');
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
			const { exportWikiPageToPdf } = await import('$lib/utils/pdf-export');
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
			title: pg.isFolder
				? m.wiki_confirm_delete_folder_title()
				: m.wiki_confirm_delete_page_title(),
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

<svelte:head><title>{pageTitle(pg.title)}</title></svelte:head>

<div class="wiki-doc relative min-h-full">
	<!-- Ambient warmth behind the header so the page reads as a crafted document. -->
	<div class="wiki-doc__glow" aria-hidden="true"></div>

	<header
		class="sticky top-0 z-20 flex h-[57px] items-center gap-3 border-b border-border/70 bg-bg/80 px-8 backdrop-blur-md"
	>
		<MobileMenuButton />
		<nav class="flex min-w-0 items-center gap-1.5 text-[14px]">
			<a href="/wiki" class="text-text-3 transition-colors hover:text-text"
				>{m.wiki_breadcrumb_root()}</a
			>
			{#each breadcrumbs as crumb, i (crumb.id)}
				<span class="text-text-4 select-none">/</span>
				{#if i === breadcrumbs.length - 1}
					<span class="max-w-[264px] truncate font-medium text-text-2">{crumb.title}</span>
				{:else}
					<a
						href="/wiki/{crumb.id}"
						class="max-w-[176px] truncate text-text-3 transition-colors hover:text-text"
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
							class="grid size-[24px] place-items-center rounded-full text-[11px] font-semibold text-white select-none"
							style:background={u.color}
							style:box-shadow="0 0 0 2px var(--bg), 0 0 0 3.5px {u.color}55"
							title={m.wiki_collaborators_now({ name: u.name })}
						>
							{initialsOf(u.name)}
						</span>
					{/each}
					{#if others.length > 4}
						<span
							class="grid size-[24px] place-items-center rounded-full bg-surface-2 text-[11px] font-semibold text-text-3 ring-2 ring-bg"
						>
							+{others.length - 4}
						</span>
					{/if}
				</div>
			{/if}

			{#if statusLabel}
				<SyncStatus
					state={collabStatus ?? 'idle'}
					label={statusLabel}
					title={m.wiki_sync_status_title()}
				/>
			{/if}

			<!-- Everything else lives in the ⋯ menu. -->
			<div class="relative">
				<IconButton ariaLabel={m.wiki_aria_more()} onclick={() => (menuOpen = !menuOpen)}>
					<Icon name="more" size={16} />
				</IconButton>
				<Popover open={menuOpen} onclose={() => (menuOpen = false)} align="right" minWidth={210}>
					<button
						type="button"
						onclick={() => {
							menuOpen = false;
							copyLink();
						}}
						class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[14px] leading-none text-text-2 hover:bg-surface-2 hover:text-text"
					>
						<span class="grid h-4 w-4 place-items-center text-text-3"
							><Icon name="link" size={14} /></span
						>
						<span>{m.wiki_aria_copy_link()}</span>
					</button>
					{#if !pg.isFolder && editor}
						<button
							type="button"
							disabled={exporting}
							onclick={() => void onExportPdf()}
							class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[14px] leading-none text-text-2 hover:bg-surface-2 hover:text-text disabled:opacity-50"
						>
							<span class="grid h-4 w-4 place-items-center text-text-3"
								><Icon name="download" size={14} /></span
							>
							<span>{exporting ? m.wiki_exporting() : m.wiki_export_pdf()}</span>
						</button>
					{/if}
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
						<span>{pg.isFolder ? m.wiki_delete_folder() : m.wiki_delete_page()}</span>
					</button>
					<!-- What the old details rail showed, as a quiet footer. -->
					<div class="-mx-0.5 my-1 h-px bg-border"></div>
					<div class="px-2 pt-1 pb-1.5 text-[12px] leading-5 text-text-4">
						{m.wiki_detail_created()}
						{fmtDate(pg.createdAt)}<br />
						{m.wiki_detail_updated()}
						{fmtDate(pg.updatedAt)}
					</div>
				</Popover>
			</div>
		</div>
	</header>

	<div class="relative z-10 mx-auto max-w-[848px] px-14 pt-12 pb-28">
		<article class="min-w-0">
			<!-- Document title block -->
			<div class="mb-5 flex items-start gap-3.5">
				<!-- Icon centered against the title's first line (see note page). -->
				<span class="flex h-[46px] shrink-0 items-center">
					<span class="wiki-doc__icon">
						<Icon name={pg.isFolder ? 'folder' : 'file'} size={22} stroke={1.75} />
					</span>
				</span>
				<!-- A one-row textarea so long titles wrap instead of clipping; Enter moves into the body. -->
				<textarea
					rows="1"
					bind:value={titleDraft}
					use:autosize={titleDraft}
					maxlength="120"
					placeholder={m.wiki_untitled()}
					oninput={onTitleInput}
					onblur={onTitleBlur}
					onkeydown={onTitleKeydown}
					class="w-full resize-none overflow-hidden border-0 bg-transparent text-[40px] leading-[1.15] font-bold tracking-[-0.025em] text-text outline-none placeholder:text-text-4 max-md:text-[32px]"
				></textarea>
			</div>

			<!-- Byline -->
			<div
				class="mb-8 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 pl-[59px] text-[14px] text-text-3"
			>
				{#if updaterAvatar}
					<span class="flex items-center gap-2">
						<Avatar user={updaterAvatar} size={22} />
						<span
							>{m.wiki_byline_edited_by()}
							<span class="font-medium text-text-2">{updatedBy?.name}</span></span
						>
					</span>
					<span class="text-text-4 select-none">·</span>
				{/if}
				<span>{m.wiki_byline_updated({ time: relativeTime(pg.updatedAt) })}</span>
			</div>

			<div class="mb-8 h-px bg-gradient-to-r from-border to-transparent"></div>

			<div bind:this={editorWrap}>
				{#if browser && pg.documentId}
					{#key pg.documentId}
						<CollaborativeWikiEditor
							documentId={pg.documentId}
							pageId={pg.id}
							user={collabUser}
							placeholder={pg.isFolder
								? m.wiki_placeholder_description()
								: m.wiki_placeholder_write_or_commands()}
							onUpdate={() => tocRev++}
							onReady={onEditorReady}
							onStatus={(s) => (collabStatus = s)}
							onPresence={(u) => (presence = u)}
						/>
					{/key}
				{:else if pg.body}
					<WikiEditor content={pg.body} editable={false} />
				{/if}
			</div>

			{#if pg.isFolder}
				{#if children.length > 0}
					<div class="mt-10">
						<div class="wiki-rail__label mb-3">{m.wiki_in_this_folder()}</div>
						<div class="grid gap-1.5">
							{#each children as child (child.id)}
								<a
									href="/wiki/{child.id}"
									class="group flex items-center gap-3 rounded-xl border border-border/70 bg-bg-elev/40 px-3.5 py-3 transition-all hover:border-border-strong hover:bg-surface"
								>
									<span
										class="grid h-8 w-8 place-items-center rounded-lg bg-surface text-text-3 transition-colors group-hover:text-accent"
									>
										<Icon name={child.isFolder ? 'folder' : 'file'} size={16} stroke={1.75} />
									</span>
									<span class="flex-1 truncate text-[14px] text-text-2 group-hover:text-text">
										{child.title}
									</span>
									<span
										class="-translate-x-1 text-text-4 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
									>
										<Icon name="chevron" size={15} />
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
	</div>

	{#key pg.id}
		<DocOutline root={editorWrap} rev={tocRev} label={m.wiki_on_this_page()} />
	{/key}
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
		transform: translateY(6px);
	}

	/* Right-rail micro labels */
	:global(.wiki-rail__label) {
		font-family: var(--font-mono);
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.13em;
		color: var(--text-4);
	}
</style>
