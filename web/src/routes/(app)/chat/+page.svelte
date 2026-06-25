<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Popover from '$lib/components/Popover.svelte';
	import Composer from '$lib/components/Composer.svelte';
	import MentionText from '$lib/components/MentionText.svelte';
	import AttachmentList from '$lib/components/attachments/AttachmentList.svelte';
	import { resolveUser } from '$lib/stores/lookup.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { AttachmentDTO } from '$lib/config/attachments';
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

	// ── New thread ───────────────────────────────────────────────────────────────
	let newOpen = $state(false);
	let newTitle = $state('');
	let newBody = $state('');
	let newTags = $state<string[]>([]);
	let creating = $state(false);
	function toggleNewTag(id: string) {
		newTags = newTags.includes(id) ? newTags.filter((t) => t !== id) : [...newTags, id];
	}
	async function submitThread() {
		if (creating || !newTitle.trim() || !newBody.trim()) return;
		creating = true;
		const ok = await post(
			'createThread',
			{ org: data.activeOrgId, title: newTitle.trim(), body: newBody.trim(), tags: newTags.join(',') },
			m.chat_err_create_failed()
		);
		creating = false;
		if (ok) {
			newOpen = false;
			newTitle = '';
			newBody = '';
			newTags = [];
		}
	}

	// ── Replies (one open at a time) ─────────────────────────────────────────────
	let replyOpenId = $state<string | null>(null);
	let replyBody = $state('');
	let replySending = $state(false);
	function openReply(id: string) {
		replyOpenId = replyOpenId === id ? null : id;
		replyBody = '';
	}
	async function sendReply(threadId: string) {
		if (replySending || !replyBody.trim()) return;
		replySending = true;
		const ok = await post('postMessage', { threadId, body: replyBody.trim() }, m.chat_err_send_failed());
		replySending = false;
		if (ok) {
			replyBody = '';
			replyOpenId = null;
		}
	}

	// ── Per-thread tag editing ────────────────────────────────────────────────────
	let tagEditId = $state<string | null>(null);
	async function toggleThreadTag(thread: Thread, tagId: string) {
		const next = thread.tagIds.includes(tagId)
			? thread.tagIds.filter((t) => t !== tagId)
			: [...thread.tagIds, tagId];
		await post('setTags', { threadId: thread.id, tags: next.join(',') }, m.chat_err_tag_failed());
	}

	// Shared POST helper — form-encodes, invalidates on success, toasts on failure.
	async function post(action: string, fields: Record<string, string>, errMsg: string): Promise<boolean> {
		const fd = new FormData();
		for (const [k, v] of Object.entries(fields)) fd.set(k, v);
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
									minWidth={200}
								>
									{#if data.tags.length === 0}
										<div class="px-2 py-1.5 text-[12px] text-text-4">{m.chat_no_tags()}</div>
									{/if}
									{#each data.tags as tag (tag.id)}
										<button
											type="button"
											onclick={() => toggleThreadTag(t, tag.id)}
											class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2"
										>
											<span class="h-2 w-2 rounded-full" style:background={tagColor(tag)}></span>
											<span class="truncate text-[13px] text-text-2">{tag.label}</span>
											{#if t.tagIds.includes(tag.id)}<span class="ml-auto text-accent"
													><Icon name="check" size={13} /></span
												>{/if}
										</button>
									{/each}
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
							<Composer
								bind:value={replyBody}
								onsend={() => sendReply(t.id)}
								sending={replySending}
								placeholder={m.chat_reply_placeholder()}
							/>
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

	<!-- ── New thread composer ──────────────────────────────────────────────────── -->
	<div class="border-t border-border px-6 py-3">
		<div class="mx-auto max-w-3xl">
			{#if newOpen}
				<div class="rounded-xl border border-border bg-surface p-3">
					<input
						bind:value={newTitle}
						placeholder={m.chat_title_placeholder()}
						class="mb-2 w-full bg-transparent text-[14px] font-semibold outline-none placeholder:text-text-3"
					/>
					<Composer bind:value={newBody} onsend={submitThread} sending={creating} />
					{#if data.tags.length}
						<div class="mt-2 flex flex-wrap items-center gap-1.5">
							{#each data.tags as t (t.id)}
								<button
									type="button"
									onclick={() => toggleNewTag(t.id)}
									class="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] {newTags.includes(
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
					{/if}
					<div class="mt-2.5 flex items-center gap-2">
						<button
							type="button"
							onclick={submitThread}
							disabled={creating || !newTitle.trim() || !newBody.trim()}
							class="rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-accent-strong disabled:opacity-50"
						>
							{m.chat_create_thread()}
						</button>
						<button
							type="button"
							onclick={() => (newOpen = false)}
							class="rounded-lg px-3 py-1.5 text-[13px] text-text-3 hover:text-text">{m.chat_cancel()}</button
						>
					</div>
				</div>
			{:else}
				<button
					type="button"
					onclick={() => (newOpen = true)}
					class="flex w-full items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[13px] text-text-3 hover:border-border-strong hover:text-text"
				>
					<Icon name="plus" size={15} />
					{m.chat_new_thread()}
				</button>
			{/if}
		</div>
	</div>
</div>
