<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Popover from '$lib/components/Popover.svelte';
	import Composer from '$lib/components/Composer.svelte';
	import MentionText from '$lib/components/MentionText.svelte';
	import AttachmentList from '$lib/components/attachments/AttachmentList.svelte';
	import AttachmentDropzone from '$lib/components/attachments/AttachmentDropzone.svelte';
	import StagedFileList from '$lib/components/attachments/StagedFileList.svelte';
	import { selectStageable, type AttachmentDTO } from '$lib/config/attachments';
	import { resolveUser } from '$lib/stores/lookup.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { ChatMessage, ChatTag, ThreadListItem } from '$lib/server/chat';

	type PageData = {
		orgs: { id: string; name: string; color: string }[];
		activeOrgId: string;
		tagFilter: string | null;
		threads: ThreadListItem[];
		tags: ChatTag[];
		subscriptions: Record<string, 'all' | 'muted'>;
		activeThreadId: string | null;
		messages: (ChatMessage & { files: AttachmentDTO[] })[];
	};
	let { data }: { data: PageData } = $props();

	const activeOrg = $derived(data.orgs.find((o) => o.id === data.activeOrgId) ?? data.orgs[0]);
	const tagMap = $derived(new Map(data.tags.map((t) => [t.id, t])));
	const activeThread = $derived(data.threads.find((t) => t.id === data.activeThreadId) ?? null);

	function who(id: string | null | undefined) {
		if (!id) return undefined;
		return resolveUser(id);
	}
	function tagColor(t: ChatTag | undefined): string {
		return t?.color ?? '#7c7c84';
	}

	function relTime(iso: string): string {
		const diff = Date.now() - new Date(iso).getTime();
		const mins = Math.floor(diff / 60_000);
		if (mins < 1) return m.chat_just_now();
		if (mins < 60) return `${mins}m`;
		const hrs = Math.floor(mins / 60);
		if (hrs < 24) return `${hrs}h`;
		return new Date(iso).toLocaleDateString();
	}

	// ─── Navigation ──────────────────────────────────────────────────────────
	function buildUrl(patch: { org?: string; tag?: string | null; thread?: string | null }) {
		const org = patch.org ?? data.activeOrgId;
		const tag = patch.tag === undefined ? data.tagFilter : patch.tag;
		const thread = patch.thread === undefined ? data.activeThreadId : patch.thread;
		const params = new URLSearchParams();
		params.set('org', org);
		if (tag) params.set('tag', tag);
		if (thread) params.set('thread', thread);
		return `/chat?${params.toString()}`;
	}
	const nav = (patch: Parameters<typeof buildUrl>[0]) =>
		goto(buildUrl(patch), { noScroll: true, keepFocus: true });

	function selectThread(id: string) {
		void nav({ thread: id });
	}
	function selectOrg(id: string) {
		orgSwitcherOpen = false;
		if (id !== data.activeOrgId) void goto(`/chat?org=${id}`);
	}
	function toggleFilter(id: string) {
		void nav({ tag: data.tagFilter === id ? null : id, thread: null });
	}

	let orgSwitcherOpen = $state(false);
	let topicsOpen = $state(false);
	let threadTagsOpen = $state(false);

	// ─── New thread ────────────────────────────────────────────────────────────
	let composeOpen = $state(false);
	let newTitle = $state('');
	let newBody = $state('');
	let newTagIds = $state<string[]>([]);
	let creating = $state(false);

	function toggleNewTag(id: string) {
		newTagIds = newTagIds.includes(id) ? newTagIds.filter((t) => t !== id) : [...newTagIds, id];
	}

	async function submitThread() {
		if (creating || !newTitle.trim() || !newBody.trim()) return;
		creating = true;
		const fd = new FormData();
		fd.set('org', data.activeOrgId);
		fd.set('title', newTitle.trim());
		fd.set('body', newBody.trim());
		fd.set('tags', newTagIds.join(','));
		try {
			const res = await fetch('/chat?/createThread', { method: 'POST', body: fd });
			const result = await res.json();
			if (!res.ok) throw new Error(m.chat_err_create_failed());
			composeOpen = false;
			newTitle = '';
			newBody = '';
			newTagIds = [];
			// SvelteKit action responses wrap data; pull the new thread id if present.
			const threadId = extractThreadId(result);
			if (threadId) void nav({ thread: threadId });
			else await invalidateAll();
		} catch (err) {
			showToast('err', err instanceof Error ? err.message : m.chat_err_create_failed());
		} finally {
			creating = false;
		}
	}

	// Action responses come back as { type, data } where data is a devalue-encoded
	// array. Be defensive — just scan for a uuid-looking threadId string.
	function extractThreadId(result: unknown): string | null {
		try {
			const raw = JSON.stringify(result);
			const m2 = raw.match(/"threadId"[^"]*"([0-9a-f-]{36})"/i);
			return m2 ? m2[1] : null;
		} catch {
			return null;
		}
	}

	// ─── Reply ───────────────────────────────────────────────────────────────
	let body = $state('');
	let sending = $state(false);
	let files = $state<File[]>([]);

	function addFiles(incoming: File[]) {
		const { accepted, errors } = selectStageable(incoming, files.length);
		for (const err of errors) showToast('err', err);
		if (accepted.length) files = [...files, ...accepted];
	}
	let fileInput = $state<HTMLInputElement>();
	function onPick(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		if (target.files?.length) addFiles(Array.from(target.files));
		target.value = '';
	}

	async function sendReply() {
		const text = body.trim();
		if ((!text && files.length === 0) || sending || !data.activeThreadId) return;
		sending = true;
		const fd = new FormData();
		fd.set('threadId', data.activeThreadId);
		fd.set('body', text || (files.length ? '(attachment)' : ''));
		for (const f of files) fd.append('attachments', f);
		try {
			const res = await fetch('/chat?/postMessage', { method: 'POST', body: fd });
			if (!res.ok) throw new Error(m.chat_err_send_failed());
			body = '';
			files = [];
			await invalidateAll();
		} catch (err) {
			showToast('err', err instanceof Error ? err.message : m.chat_err_send_failed());
		} finally {
			sending = false;
		}
	}

	// ─── Thread tags ───────────────────────────────────────────────────────────
	async function toggleThreadTag(tagId: string) {
		if (!activeThread) return;
		const next = activeThread.tagIds.includes(tagId)
			? activeThread.tagIds.filter((t) => t !== tagId)
			: [...activeThread.tagIds, tagId];
		const fd = new FormData();
		fd.set('threadId', activeThread.id);
		fd.set('tags', next.join(','));
		try {
			const res = await fetch('/chat?/setTags', { method: 'POST', body: fd });
			if (!res.ok) throw new Error(m.chat_err_tag_failed());
			await invalidateAll();
		} catch (err) {
			showToast('err', err instanceof Error ? err.message : m.chat_err_tag_failed());
		}
	}

	// ─── Tag subscriptions (follow / mute) ──────────────────────────────────────
	// Cycle: default → follow (all) → mute → default.
	async function cycleSubscription(tagId: string) {
		const cur = data.subscriptions[tagId];
		const next = cur === undefined ? 'all' : cur === 'all' ? 'muted' : '';
		const fd = new FormData();
		fd.set('tagId', tagId);
		fd.set('mode', next);
		try {
			const res = await fetch('/chat?/toggleSubscription', { method: 'POST', body: fd });
			if (!res.ok) throw new Error(m.chat_err_subscription_failed());
			await invalidateAll();
		} catch (err) {
			showToast('err', err instanceof Error ? err.message : m.chat_err_subscription_failed());
		}
	}
	function subIcon(mode: 'all' | 'muted' | undefined): string {
		return mode === 'all' ? 'bell' : mode === 'muted' ? 'x' : 'bell';
	}
</script>

<div class="flex h-full min-h-0">
	<!-- ── Left: thread list ─────────────────────────────────────────────── -->
	<aside class="flex w-80 shrink-0 flex-col border-r border-border bg-bg-elev">
		<div class="flex items-center gap-2 px-3 py-3">
			<div class="relative min-w-0 flex-1">
				<button
					type="button"
					onclick={() => data.orgs.length > 1 && (orgSwitcherOpen = !orgSwitcherOpen)}
					class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface {data
						.orgs.length > 1
						? 'cursor-pointer'
						: 'cursor-default'}"
				>
					<span
						class="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-semibold text-white"
						style:background={activeOrg?.color ?? '#7c7c84'}
					>
						{(activeOrg?.name ?? '?').slice(0, 1).toUpperCase()}
					</span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-[13px] font-semibold">{activeOrg?.name}</span>
						<span class="block text-[11px] leading-tight text-text-3">{m.chat_title()}</span>
					</span>
					{#if data.orgs.length > 1}<Icon name="chevron" size={12} class="text-text-3" />{/if}
				</button>
				{#if data.orgs.length > 1}
					<Popover open={orgSwitcherOpen} onclose={() => (orgSwitcherOpen = false)} minWidth={232}>
						{#each data.orgs as o (o.id)}
							<button
								type="button"
								onclick={() => selectOrg(o.id)}
								class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
							>
								<span class="h-2 w-2 rounded-full" style:background={o.color}></span>
								<span class="truncate text-[13px]">{o.name}</span>
								{#if o.id === data.activeOrgId}
									<span class="ml-auto text-accent"><Icon name="check" size={13} /></span>
								{/if}
							</button>
						{/each}
					</Popover>
				{/if}
			</div>
			<!-- Topics / notifications -->
			<div class="relative">
				<button
					type="button"
					aria-label={m.chat_topics()}
					onclick={() => (topicsOpen = !topicsOpen)}
					class="grid h-8 w-8 place-items-center rounded-lg text-text-3 hover:bg-surface hover:text-text"
				>
					<Icon name="sliders" size={15} />
				</button>
				<Popover
					open={topicsOpen}
					onclose={() => (topicsOpen = false)}
					align="right"
					minWidth={248}
				>
					<div class="px-2 pt-1 pb-1.5 text-[11px] tracking-[0.08em] text-text-4 uppercase">
						{m.chat_topic_notifications()}
					</div>
					{#if data.tags.length === 0}
						<div class="px-2 py-1.5 text-[12px] text-text-4">{m.chat_no_tags()}</div>
					{/if}
					{#each data.tags as t (t.id)}
						{@const mode = data.subscriptions[t.id]}
						<button
							type="button"
							onclick={() => cycleSubscription(t.id)}
							class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2"
						>
							<span class="h-2 w-2 rounded-full" style:background={tagColor(t)}></span>
							<span class="truncate text-[13px] text-text-2">{t.label}</span>
							<span
								class="ml-auto inline-flex items-center gap-1 text-[11px] {mode === 'all'
									? 'text-accent'
									: mode === 'muted'
										? 'text-text-4'
										: 'text-text-3'}"
							>
								<Icon name={subIcon(mode)} size={12} />
								{mode === 'all' ? m.chat_following() : mode === 'muted' ? m.chat_muted() : m.chat_default()}
							</span>
						</button>
					{/each}
				</Popover>
			</div>
		</div>

		<!-- Tag filter bar -->
		{#if data.tags.length}
			<div class="flex flex-wrap gap-1 px-3 pb-2">
				{#each data.tags as t (t.id)}
					<button
						type="button"
						onclick={() => toggleFilter(t.id)}
						class="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition-colors {data.tagFilter ===
						t.id
							? 'border-accent bg-accent/10 text-accent'
							: 'border-border text-text-3 hover:text-text-2'}"
					>
						<span class="h-1.5 w-1.5 rounded-full" style:background={tagColor(t)}></span>
						{t.label}
					</button>
				{/each}
			</div>
		{/if}

		<!-- New thread -->
		<div class="px-3 pb-2">
			<button
				type="button"
				onclick={() => (composeOpen = !composeOpen)}
				class="flex w-full items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2 text-[13px] text-text-2 hover:border-border-strong hover:text-text"
			>
				<Icon name="plus" size={15} class="text-text-3" />
				<span>{m.chat_new_thread()}</span>
			</button>
		</div>

		<!-- Thread list -->
		<div class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
			{#each data.threads as t (t.id)}
				{@const author = who(t.lastMessage?.authorId ?? t.createdBy)}
				<button
					type="button"
					onclick={() => selectThread(t.id)}
					class="mb-0.5 flex w-full flex-col gap-1 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--row-hover)] {t.id ===
					data.activeThreadId
						? 'bg-[var(--row-active)]'
						: ''}"
				>
					<div class="flex items-center gap-2">
						{#if t.unread}<span class="h-2 w-2 shrink-0 rounded-full bg-accent"></span>{/if}
						<span class="truncate text-[13px] font-medium text-text">{t.title}</span>
						<span class="ml-auto shrink-0 font-mono text-[10px] text-text-4"
							>{relTime(t.updatedAt)}</span
						>
					</div>
					{#if t.lastMessage}
						<div class="truncate text-[12px] text-text-3">
							{author?.name ? `${author.name}: ` : ''}{t.lastMessage.body}
						</div>
					{/if}
					{#if t.tagIds.length}
						<div class="flex flex-wrap gap-1">
							{#each t.tagIds as id (id)}
								{@const tg = tagMap.get(id)}
								{#if tg}
									<span
										class="inline-flex items-center gap-1 rounded-full px-1.5 text-[10px] text-text-3"
										style:background="{tagColor(tg)}22"
									>
										<span class="h-1 w-1 rounded-full" style:background={tagColor(tg)}></span>
										{tg.label}
									</span>
								{/if}
							{/each}
						</div>
					{/if}
				</button>
			{/each}
			{#if data.threads.length === 0}
				<div class="px-3 py-6 text-center text-[12px] text-text-4">{m.chat_empty()}</div>
			{/if}
		</div>
	</aside>

	<!-- ── Right: thread detail ──────────────────────────────────────────── -->
	<section class="flex min-w-0 flex-1 flex-col">
		{#if composeOpen}
			<div class="flex min-h-0 flex-1 flex-col p-6">
				<h2 class="mb-3 text-[15px] font-semibold text-text">{m.chat_new_thread()}</h2>
				<input
					bind:value={newTitle}
					placeholder={m.chat_title_placeholder()}
					class="mb-3 w-full rounded-lg border border-border bg-surface px-3 py-2 text-[14px] outline-none focus:border-border-strong"
				/>
				<div class="mb-3">
					<Composer bind:value={newBody} onsend={submitThread} sending={creating} />
				</div>
				<div class="mb-4 flex flex-wrap items-center gap-1.5">
					<span class="text-[12px] text-text-4">{m.chat_tags()}:</span>
					{#each data.tags as t (t.id)}
						<button
							type="button"
							onclick={() => toggleNewTag(t.id)}
							class="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] {newTagIds.includes(
								t.id
							)
								? 'border-accent bg-accent/10 text-accent'
								: 'border-border text-text-3'}"
						>
							<span class="h-1.5 w-1.5 rounded-full" style:background={tagColor(t)}></span>
							{t.label}
						</button>
					{/each}
				</div>
				<div class="flex gap-2">
					<button
						type="button"
						onclick={submitThread}
						disabled={creating || !newTitle.trim() || !newBody.trim()}
						class="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white hover:bg-accent-strong disabled:opacity-50"
					>
						{m.chat_create_thread()}
					</button>
					<button
						type="button"
						onclick={() => (composeOpen = false)}
						class="rounded-lg px-4 py-2 text-[13px] text-text-3 hover:text-text"
					>
						{m.chat_cancel()}
					</button>
				</div>
			</div>
		{:else if data.activeThreadId && activeThread}
			<!-- Header -->
			<div class="flex items-center gap-3 border-b border-border px-5 py-3">
				<div class="min-w-0 flex-1">
					<h2 class="truncate text-[15px] font-semibold text-text">{activeThread.title}</h2>
					{#if activeThread.tagIds.length}
						<div class="mt-1 flex flex-wrap gap-1">
							{#each activeThread.tagIds as id (id)}
								{@const tg = tagMap.get(id)}
								{#if tg}
									<span
										class="inline-flex items-center gap-1 rounded-full px-1.5 text-[10px] text-text-3"
										style:background="{tagColor(tg)}22"
									>
										<span class="h-1 w-1 rounded-full" style:background={tagColor(tg)}></span>
										{tg.label}
									</span>
								{/if}
							{/each}
						</div>
					{/if}
				</div>
				<div class="relative">
					<button
						type="button"
						aria-label={m.chat_edit_tags()}
						onclick={() => (threadTagsOpen = !threadTagsOpen)}
						class="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[12px] text-text-3 hover:text-text"
					>
						<Icon name="bookmark" size={13} />
						{m.chat_tags()}
					</button>
					<Popover open={threadTagsOpen} onclose={() => (threadTagsOpen = false)} align="right">
						{#if data.tags.length === 0}
							<div class="px-2 py-1.5 text-[12px] text-text-4">{m.chat_no_tags()}</div>
						{/if}
						{#each data.tags as t (t.id)}
							<button
								type="button"
								onclick={() => toggleThreadTag(t.id)}
								class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2"
							>
								<span class="h-2 w-2 rounded-full" style:background={tagColor(t)}></span>
								<span class="truncate text-[13px] text-text-2">{t.label}</span>
								{#if activeThread.tagIds.includes(t.id)}
									<span class="ml-auto text-accent"><Icon name="check" size={13} /></span>
								{/if}
							</button>
						{/each}
					</Popover>
				</div>
			</div>

			<!-- Messages -->
			<div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
				<div class="space-y-4">
					{#each data.messages as msg (msg.id)}
						{@const u = who(msg.authorId)}
						<div class="flex gap-3">
							<Avatar user={u} size={28} />
							<div class="min-w-0 flex-1">
								<div class="flex items-baseline gap-2">
									<span class="text-[13px] font-medium text-text"
										>{u?.name ?? m.chat_unknown_user()}</span
									>
									<span class="font-mono text-[10px] text-text-4">{relTime(msg.createdAt)}</span>
								</div>
								<div class="mt-0.5 text-[13px] leading-relaxed whitespace-pre-wrap text-text-2">
									<MentionText text={msg.body} />
								</div>
								{#if msg.files?.length}
									<div class="mt-2"><AttachmentList attachments={msg.files} /></div>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Reply composer -->
			<div class="border-t border-border px-5 py-3">
				<AttachmentDropzone onfiles={addFiles}>
					{#if files.length}
						<div class="mb-2"><StagedFileList {files} onremove={(i) => (files = files.filter((_, j) => j !== i))} /></div>
					{/if}
					<Composer bind:value={body} onsend={sendReply} {sending}>
						{#snippet rightActions()}
							<button
								type="button"
								aria-label={m.chat_attach()}
								onclick={() => fileInput?.click()}
								class="grid h-8 w-8 place-items-center rounded-lg text-text-3 hover:bg-surface hover:text-text"
							>
								<Icon name="paperclip" size={15} />
							</button>
							<input
								bind:this={fileInput}
								type="file"
								multiple
								class="hidden"
								onchange={onPick}
							/>
						{/snippet}
					</Composer>
				</AttachmentDropzone>
			</div>
		{:else}
			<div class="grid flex-1 place-items-center text-center">
				<div class="text-[13px] text-text-4">
					<Icon name="msg" size={28} class="mx-auto mb-2 text-text-4" />
					{m.chat_select_thread()}
				</div>
			</div>
		{/if}
	</section>
</div>
