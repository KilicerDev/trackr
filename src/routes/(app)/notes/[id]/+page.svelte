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
	import { showToast } from '$lib/toast.svelte';
	import CollaborativeWikiEditor, {
		type PresenceUser
	} from '$lib/components/wiki/CollaborativeWikiEditor.svelte';
	import ShareDialog from '$lib/components/notes/ShareDialog.svelte';
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
		class="sticky top-0 z-20 flex items-center gap-3 px-8 h-[52px] border-b border-border/70 bg-bg/80 backdrop-blur-md"
	>
		{#if note.kind === 'meeting'}
			{#if project}
				<a
					href="/projects/{project.id}"
					class="flex items-center gap-1.5 h-7 text-[12px] text-text-2 rounded-md bg-surface px-2 hover:text-text transition-colors"
					title={m.notes_meeting_project({ name: project.name })}
				>
					<span class="w-2 h-2 rounded-[2.5px] shrink-0" style:background={project.color}></span>
					<span class="truncate max-w-[160px]">{project.name}</span>
				</a>
			{/if}
			{#if task && taskRef}
				<a
					href="/tasks?task={taskRef}"
					class="flex items-center gap-1.5 h-7 text-[12px] text-text-3 rounded-md bg-surface px-2 hover:text-text transition-colors"
					title={task.title}
				>
					<Icon name="check-square" size={12} class="shrink-0" />
					<span class="font-mono shrink-0">{taskRef}</span>
					<span class="truncate max-w-[140px]">{task.title}</span>
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
				class="flex items-center gap-1.5 text-[11.5px] text-text-3 rounded-md bg-surface px-2 py-0.5"
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
							class="grid place-items-center rounded-full text-[9.5px] font-semibold text-white select-none"
							style:width="22px"
							style:height="22px"
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
						class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-text-2 text-left text-[13px] leading-none"
					>
						<span class="grid place-items-center w-4 h-4"><Icon name="bookmark" size={13} /></span>
						<span>{m.notes_save_as_template()}</span>
					</button>
					{#if isOwner}
						<button
							type="button"
							onclick={() => void onDelete()}
							class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-accent text-left text-[13px] leading-none"
						>
							<span class="grid place-items-center w-4 h-4"><Icon name="trash" size={13} /></span>
							<span>{m.notes_delete()}</span>
						</button>
					{/if}
				</Popover>
			</div>
		</div>
	</header>

	<div class="mx-auto max-w-[760px] px-8 pt-12 pb-28">
		<div class="flex items-start gap-3.5 mb-8">
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
				class="w-full bg-transparent border-0 outline-none text-[33px] font-semibold tracking-[-0.02em] text-text leading-[1.12] placeholder:text-text-4 pt-1 read-only:cursor-default"
			/>
		</div>

		{#if browser && note.documentId}
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
		{/if}
	</div>
</div>

{#if isOwner}
	<ShareDialog bind:open={shareOpen} noteId={note.id} links={data.shareLinks} />
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
