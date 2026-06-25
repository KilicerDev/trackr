<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Popover from '$lib/components/Popover.svelte';
	import Composer from '$lib/components/Composer.svelte';
	import MentionTextarea from '$lib/components/MentionTextarea.svelte';
	import MentionText from '$lib/components/MentionText.svelte';
	import AttachmentList from '$lib/components/attachments/AttachmentList.svelte';
	import AttachmentDropzone from '$lib/components/attachments/AttachmentDropzone.svelte';
	import StagedFileList from '$lib/components/attachments/StagedFileList.svelte';
	import TagSelect from '$lib/components/chat/TagSelect.svelte';
	import { createOrgTag } from '$lib/components/chat/tags';
	import { resolveUser } from '$lib/stores/lookup.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import { m } from '$lib/paraglide/messages';
	import { selectStageable, type AttachmentDTO } from '$lib/config/attachments';
	import type { ChatMessage, ChatTag, FeedThread } from '$lib/server/chat';

	type FeedMsg = Omit<ChatMessage, 'files'> & { files: AttachmentDTO[] };
	type Thread = Omit<FeedThread, 'messages'> & { messages: FeedMsg[] };
	type PageData = {
		orgs: { id: string; name: string; color: string }[];
		activeOrgId: string;
		isPortal: boolean;
		tagFilter: string | null;
		feed: Thread[];
		tags: ChatTag[];
		subscriptions: Record<string, 'all' | 'muted'>;
	};
	let { data }: { data: PageData } = $props();

	const tagMap = $derived(new Map(data.tags.map((t) => [t.id, t])));
	const activeOrg = $derived(data.orgs.find((o) => o.id === data.activeOrgId) ?? data.orgs[0]);

	const who = (id: string | null | undefined) => (id ? resolveUser(id) : undefined);
	const tagColor = (t: ChatTag | undefined) => t?.color ?? '#7c7c84';
	function relTime(iso: string): string {
		const diff = Date.now() - new Date(iso).getTime();
		const mins = Math.floor(diff / 60_000);
		if (mins < 1) return m.chat_just_now();
		if (mins < 60) return `${mins}m`;
		const hrs = Math.floor(mins / 60);
		if (hrs < 24) return `${hrs}h`;
		return new Date(iso).toLocaleDateString();
	}

	// ── Navigation (org / tag filter) ──────────────────────────────────────────
	function chatUrl(patch: { org?: string; tag?: string | null }) {
		const params = new URLSearchParams();
		const org = patch.org ?? data.activeOrgId;
		if (!data.isPortal) params.set('org', org); // portal follows its own switcher
		const tag = patch.tag === undefined ? data.tagFilter : patch.tag;
		if (tag) params.set('tag', tag);
		const qs = params.toString();
		return qs ? `/chat?${qs}` : '/chat';
	}
	let orgOpen = $state(false);
	function selectOrg(id: string) {
		orgOpen = false;
		if (id !== data.activeOrgId) void goto(chatUrl({ org: id, tag: null }));
	}
	function filterTag(id: string | null) {
		void goto(chatUrl({ tag: id }), { noScroll: true, keepFocus: true });
	}

	// ── Topic notifications (follow / mute) ──────────────────────────────────────
	let topicsOpen = $state(false);
	async function cycleSubscription(tagId: string) {
		const cur = data.subscriptions[tagId];
		const next = cur === undefined ? 'all' : cur === 'all' ? 'muted' : '';
		await post('toggleSubscription', { tagId, mode: next }, m.chat_err_subscription_failed());
	}

	// ── New thread (always-open composer) ────────────────────────────────────────
	let newTitle = $state('');
	let newBody = $state('');
	let newTags = $state<string[]>([]);
	let newFiles = $state<File[]>([]);
	let newFileInput = $state<HTMLInputElement>();
	let creating = $state(false);
	// Inline `#` in the message body adds a tag chip (id given) or creates one.
	async function handleInlineTag(id: string | null, label: string) {
		if (id) {
			if (!newTags.includes(id)) newTags = [...newTags, id];
			return;
		}
		try {
			await createOrgTag(data.activeOrgId, label);
			await invalidateAll();
			const created = data.tags.find((t) => t.label.toLowerCase() === label.toLowerCase());
			if (created && !newTags.includes(created.id)) newTags = [...newTags, created.id];
		} catch (e) {
			showToast('err', e instanceof Error ? e.message : m.chat_err_tag_failed());
		}
	}
	async function submitThread() {
		if (creating || !newTitle.trim() || (!newBody.trim() && newFiles.length === 0)) return;
		creating = true;
		const ok = await post(
			'createThread',
			{ org: data.activeOrgId, title: newTitle.trim(), body: newBody.trim(), tags: newTags.join(',') },
			m.chat_err_create_failed(),
			newFiles
		);
		creating = false;
		if (ok) {
			newTitle = '';
			newBody = '';
			newTags = [];
			newFiles = [];
		}
	}
	function newKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			void submitThread();
		}
	}

	// ── Replies (one open at a time) ─────────────────────────────────────────────
	let replyOpenId = $state<string | null>(null);
	let replyBody = $state('');
	let replyFiles = $state<File[]>([]);
	let replyFileInput = $state<HTMLInputElement>();
	let replySending = $state(false);
	function openReply(id: string) {
		replyOpenId = replyOpenId === id ? null : id;
		replyBody = '';
		replyFiles = [];
	}
	async function sendReply(threadId: string) {
		if (replySending || (!replyBody.trim() && replyFiles.length === 0)) return;
		replySending = true;
		const ok = await post(
			'postMessage',
			{ threadId, body: replyBody.trim() },
			m.chat_err_send_failed(),
			replyFiles
		);
		replySending = false;
		if (ok) {
			replyBody = '';
			replyFiles = [];
			replyOpenId = null;
		}
	}
	function pickInto(input: HTMLInputElement | undefined, apply: (files: File[]) => void) {
		const files = input?.files;
		if (files?.length) apply(Array.from(files));
		if (input) input.value = '';
	}

	// ── Per-thread tag editing ────────────────────────────────────────────────────
	let tagEditId = $state<string | null>(null);
	async function persistThreadTags(threadId: string, ids: string[]) {
		await post('setTags', { threadId, tags: ids.join(',') }, m.chat_err_tag_failed());
	}

	// Staging helper for a file picker / drop target.
	function stage(current: File[], incoming: File[]): File[] {
		const { accepted, errors } = selectStageable(incoming, current.length);
		for (const err of errors) showToast('err', err);
		return accepted.length ? [...current, ...accepted] : current;
	}

	// Shared POST helper — form-encodes, optionally attaches files, invalidates on
	// success, toasts on failure.
	async function post(
		action: string,
		fields: Record<string, string>,
		errMsg: string,
		files: File[] = []
	): Promise<boolean> {
		const fd = new FormData();
		for (const [k, v] of Object.entries(fields)) fd.set(k, v);
		for (const f of files) fd.append('attachments', f);
		try {
			const res = await fetch(`/chat?/${action}`, { method: 'POST', body: fd });
			if (!res.ok) throw new Error(errMsg);
			await invalidateAll();
			return true;
		} catch (err) {
			showToast('err', err instanceof Error ? err.message : errMsg);
			return false;
		}
	}

	// Keep the newest threads in view (chat-style), without fighting the user.
	let feedEl = $state<HTMLDivElement>();
	$effect(() => {
		data.feed.length;
		if (feedEl) feedEl.scrollTop = feedEl.scrollHeight;
	});
</script>

<div class="flex h-full flex-col bg-bg">
	<!-- ── Header ─────────────────────────────────────────────────────────────── -->
	<header class="flex items-center gap-3 border-b border-border px-6 py-2.5">
		{#if !data.isPortal && data.orgs.length > 1}
			<div class="relative">
				<button
					type="button"
					onclick={() => (orgOpen = !orgOpen)}
					class="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-surface"
				>
					<span
						class="grid h-5 w-5 place-items-center rounded text-[10px] font-semibold text-white"
						style:background={activeOrg?.color ?? '#7c7c84'}>{(activeOrg?.name ?? '?')[0]}</span
					>
					<span class="text-[14px] font-semibold">{activeOrg?.name}</span>
					<Icon name="chevron" size={12} class="text-text-3" />
				</button>
				<Popover open={orgOpen} onclose={() => (orgOpen = false)} minWidth={220}>
					{#each data.orgs as o (o.id)}
						<button
							type="button"
							onclick={() => selectOrg(o.id)}
							class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
						>
							<span class="h-2 w-2 rounded-full" style:background={o.color}></span>
							<span class="truncate text-[13px]">{o.name}</span>
							{#if o.id === data.activeOrgId}<span class="ml-auto text-accent"
									><Icon name="check" size={13} /></span
								>{/if}
						</button>
					{/each}
				</Popover>
			</div>
		{:else}
			<h1 class="text-[14px] font-semibold">{m.chat_title()}</h1>
		{/if}

		{#if data.tags.length}
			<div class="ml-2 flex flex-wrap items-center gap-1">
				<button
					type="button"
					onclick={() => filterTag(null)}
					class="rounded-full px-2 py-0.5 text-[11px] {data.tagFilter === null
						? 'bg-surface-2 text-text'
						: 'text-text-3 hover:text-text-2'}">{m.chat_filter_all()}</button
				>
				{#each data.tags as t (t.id)}
					<button
						type="button"
						onclick={() => filterTag(t.id)}
						class="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] {data.tagFilter ===
						t.id
							? 'border-accent bg-accent/10 text-accent'
							: 'border-transparent text-text-3 hover:text-text-2'}"
					>
						<span class="h-1.5 w-1.5 rounded-full" style:background={tagColor(t)}></span>
						{t.label}
					</button>
				{/each}
			</div>
		{/if}

		<div class="relative ml-auto">
			<button
				type="button"
				aria-label={m.chat_topics()}
				onclick={() => (topicsOpen = !topicsOpen)}
				class="grid h-8 w-8 place-items-center rounded-lg text-text-3 hover:bg-surface hover:text-text"
			>
				<Icon name="sliders" size={15} />
			</button>
			<Popover open={topicsOpen} onclose={() => (topicsOpen = false)} align="right" minWidth={248}>
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
							<Icon name={mode === 'muted' ? 'x' : 'bell'} size={12} />
							{mode === 'all' ? m.chat_following() : mode === 'muted' ? m.chat_muted() : m.chat_default()}
						</span>
					</button>
				{/each}
			</Popover>
		</div>
	</header>

	<!-- ── Feed ───────────────────────────────────────────────────────────────── -->
	<div bind:this={feedEl} class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
		<div class="mx-auto max-w-3xl space-y-5">
			{#if data.feed.length === 0}
				<div class="grid place-items-center py-20 text-center">
					<Icon name="msg" size={26} class="mb-2 text-text-4" />
					<div class="text-[13px] text-text-4">{m.chat_empty()}</div>
				</div>
			{/if}

			{#each data.feed as t (t.id)}
				{@const root = t.messages[0]}
				{@const replies = t.messages.slice(1)}
				{@const author = who(root?.authorId ?? t.createdBy)}
				<article class="rounded-xl border border-border bg-surface">
					<!-- Post head -->
					<div class="px-4 pt-3.5 pb-1">
						<div class="flex items-center gap-2.5">
							<Avatar user={author} size={28} />
							<span class="text-[13px] font-medium text-text">{author?.name ?? m.chat_unknown_user()}</span>
							<span class="font-mono text-[10px] text-text-4">{relTime(t.createdAt)}</span>
							<div class="relative ml-auto">
								<button
									type="button"
									aria-label={m.chat_edit_tags()}
									onclick={() => (tagEditId = tagEditId === t.id ? null : t.id)}
									class="grid h-7 w-7 place-items-center rounded-lg text-text-4 hover:bg-bg-elev hover:text-text"
								>
									<Icon name="bookmark" size={13} />
								</button>
								<Popover
									open={tagEditId === t.id}
									onclose={() => (tagEditId = null)}
									align="right"
									minWidth={260}
								>
									<div class="p-1">
										<TagSelect
											available={data.tags}
											selected={t.tagIds}
											orgId={data.activeOrgId}
											onchange={(ids) => persistThreadTags(t.id, ids)}
										/>
									</div>
								</Popover>
							</div>
						</div>
						<h2 class="mt-2 text-[15px] leading-snug font-semibold text-text">{t.title}</h2>
						{#if root}
							<div class="mt-1 text-[13px] leading-relaxed whitespace-pre-wrap text-text-2">
								<MentionText text={root.body} />
							</div>
							{#if root.files?.length}
								<div class="mt-2"><AttachmentList attachments={root.files} /></div>
							{/if}
						{/if}
						{#if t.tagIds.length}
							<div class="mt-2 flex flex-wrap gap-1">
								{#each t.tagIds as id (id)}
									{@const tg = tagMap.get(id)}
									{#if tg}
										<span
											class="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] text-text-3"
											style:background="{tagColor(tg)}1f"
										>
											<span class="h-1 w-1 rounded-full" style:background={tagColor(tg)}></span>
											{tg.label}
										</span>
									{/if}
								{/each}
							</div>
						{/if}
					</div>

					<!-- Replies -->
					{#if replies.length}
						<div class="mt-2 space-y-3 border-t border-border px-4 py-3">
							{#each replies as r (r.id)}
								{@const ru = who(r.authorId)}
								<div class="flex gap-2.5">
									<Avatar user={ru} size={22} />
									<div class="min-w-0 flex-1">
										<div class="flex items-baseline gap-2">
											<span class="text-[12px] font-medium text-text"
												>{ru?.name ?? m.chat_unknown_user()}</span
											>
											<span class="font-mono text-[10px] text-text-4">{relTime(r.createdAt)}</span>
										</div>
										<div class="text-[13px] leading-relaxed whitespace-pre-wrap text-text-2">
											<MentionText text={r.body} />
										</div>
										{#if r.files?.length}
											<div class="mt-1.5"><AttachmentList attachments={r.files} /></div>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{/if}

					<!-- Reply affordance -->
					<div class="border-t border-border px-4 py-2">
						{#if replyOpenId === t.id}
							<AttachmentDropzone onfiles={(f) => (replyFiles = stage(replyFiles, f))}>
								{#if replyFiles.length}
									<div class="mb-2">
										<StagedFileList
											files={replyFiles}
											onremove={(i) => (replyFiles = replyFiles.filter((_, j) => j !== i))}
										/>
									</div>
								{/if}
								<Composer
									bind:value={replyBody}
									onsend={() => sendReply(t.id)}
									sending={replySending}
									hasAttachments={replyFiles.length > 0}
									placeholder={m.chat_reply_placeholder()}
								>
									{#snippet rightActions()}
										<button
											type="button"
											aria-label={m.chat_attach()}
											onclick={() => replyFileInput?.click()}
											class="grid h-8 w-8 place-items-center rounded-lg text-text-3 hover:bg-surface hover:text-text"
										>
											<Icon name="paperclip" size={15} />
										</button>
										<input
											bind:this={replyFileInput}
											type="file"
											multiple
											class="hidden"
											onchange={() => pickInto(replyFileInput, (f) => (replyFiles = stage(replyFiles, f)))}
										/>
									{/snippet}
								</Composer>
							</AttachmentDropzone>
						{:else}
							<button
								type="button"
								onclick={() => openReply(t.id)}
								class="flex items-center gap-2 text-[12px] text-text-3 hover:text-text"
							>
								<Icon name="msg" size={13} />
								{m.chat_reply()}
							</button>
						{/if}
					</div>
				</article>
			{/each}
		</div>
	</div>

	<!-- ── New thread composer (always open) ────────────────────────────────────── -->
	<div class="border-t border-border px-6 py-3">
		<div class="mx-auto max-w-3xl">
			<AttachmentDropzone onfiles={(f) => (newFiles = stage(newFiles, f))}>
				<div
					class="rounded-xl border border-border bg-surface transition-colors focus-within:border-border-strong"
				>
					<input
						bind:value={newTitle}
						placeholder={m.chat_title_placeholder()}
						onkeydown={newKey}
						class="w-full bg-transparent px-3.5 pt-3 text-[15px] font-semibold outline-none placeholder:text-text-3"
					/>
					<MentionTextarea
						bind:value={newBody}
						tags={data.tags}
						onTagAdd={handleInlineTag}
						onkeydown={newKey}
						placeholder={m.chat_message_placeholder()}
						rows={2}
						class="w-full resize-none border-0 bg-transparent px-3.5 pt-1.5 pb-1 text-[13px] leading-relaxed outline-none placeholder:text-text-3"
					/>
					{#if newFiles.length}
						<div class="px-3.5 pb-1">
							<StagedFileList
								files={newFiles}
								onremove={(i) => (newFiles = newFiles.filter((_, j) => j !== i))}
							/>
						</div>
					{/if}
					<div class="flex items-center gap-2 px-2.5 pt-1 pb-2.5">
						<button
							type="button"
							aria-label={m.chat_attach()}
							onclick={() => newFileInput?.click()}
							class="grid h-8 w-8 place-items-center rounded-lg text-text-3 hover:bg-bg-elev hover:text-text"
						>
							<Icon name="paperclip" size={15} />
						</button>
						<input
							bind:this={newFileInput}
							type="file"
							multiple
							class="hidden"
							onchange={() => pickInto(newFileInput, (f) => (newFiles = stage(newFiles, f)))}
						/>
						<TagSelect
							dropUp
							available={data.tags}
							selected={newTags}
							orgId={data.activeOrgId}
							onchange={(ids) => (newTags = ids)}
						/>
						<button
							type="button"
							aria-label={m.chat_create_thread()}
							onclick={submitThread}
							disabled={creating || !newTitle.trim() || (!newBody.trim() && newFiles.length === 0)}
							class="ml-auto grid h-8 w-8 place-items-center rounded-lg bg-accent text-white shadow-btn transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
						>
							{#if creating}
								<span
									class="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent"
								></span>
							{:else}
								<Icon name="send" size={13} />
							{/if}
						</button>
					</div>
				</div>
			</AttachmentDropzone>
		</div>
	</div>
</div>
