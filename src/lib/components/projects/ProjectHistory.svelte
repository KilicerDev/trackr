<script lang="ts">
	import Drawer from '$lib/components/Drawer.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Composer from '$lib/components/Composer.svelte';
	import { resolveUser } from '$lib/lookup.svelte';
	import { invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import { showToast } from '$lib/toast.svelte';
	import type { ActionResult } from '@sveltejs/kit';

	type Actor = { id: string; name: string; initials: string; color: string } | null;
	export type ActivityItem = {
		id: string;
		type: string;
		taskId: string | null;
		body: string | null;
		meta: Record<string, unknown> | null;
		createdAt: string;
		actor: Actor;
	};

	interface Props {
		open: boolean;
		onclose: () => void;
		activity: ActivityItem[];
		// Display ids of tasks still loadable on the page; refs not in here
		// (deleted/archived) render as plain text rather than a link.
		taskIds?: string[];
		onOpenTask?: (ref: string) => void;
	}
	let { open, onclose, activity, taskIds = [], onOpenTask }: Props = $props();

	const openableTasks = $derived(new Set(taskIds));

	// Server returns the first page; "load more" appends here. Reset whenever
	// the load-provided page changes (e.g. after a comment invalidates).
	let extra = $state<ActivityItem[]>([]);
	let lastBaseId = $state<string | null>(null);
	$effect(() => {
		const head = activity[0]?.id ?? null;
		if (head !== lastBaseId) {
			lastBaseId = head;
			extra = [];
		}
	});
	const items = $derived([...activity, ...extra]);

	let loadingMore = $state(false);
	let canLoadMore = $state(true);

	async function loadMore() {
		if (loadingMore || !canLoadMore) return;
		loadingMore = true;
		const fd = new FormData();
		fd.append('offset', String(items.length));
		try {
			const res = await fetch(`?/activity`, {
				method: 'POST',
				body: fd,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result: ActionResult = deserialize(await res.text());
			if (result.type === 'success') {
				const next = ((result.data as { items?: ActivityItem[] } | undefined)?.items ?? []);
				if (next.length === 0) canLoadMore = false;
				extra = [...extra, ...next];
			}
		} catch {
			showToast('err', 'Failed to load more activity.');
		} finally {
			loadingMore = false;
		}
	}

	let commentBody = $state('');
	let sending = $state(false);

	async function sendComment() {
		const text = commentBody.trim();
		if (!text || sending) return;
		sending = true;
		const fd = new FormData();
		fd.append('body', text);
		try {
			const res = await fetch(`?/commentAdd`, {
				method: 'POST',
				body: fd,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result: ActionResult = deserialize(await res.text());
			if (result.type === 'success') {
				commentBody = '';
				await invalidateAll();
			} else {
				const msg =
					result.type === 'failure'
						? (result.data as { message?: string } | undefined)?.message ?? 'Failed to comment.'
						: 'Failed to comment.';
				showToast('err', msg);
			}
		} catch {
			showToast('err', 'Network error.');
		} finally {
			sending = false;
		}
	}

	// ─── Display helpers ────────────────────────────────────────────────────
	function humanize(v: unknown): string {
		return String(v ?? '').replace(/[._]/g, ' ');
	}
	function roleLabel(v: unknown): string {
		const id = String(v ?? '');
		const last = id.includes('.') ? id.slice(id.lastIndexOf('.') + 1) : id;
		return last.charAt(0).toUpperCase() + last.slice(1);
	}
	function userName(id: unknown): string {
		const u = id ? resolveUser(String(id)) : null;
		return u?.name ?? '—';
	}
	function fmtMinutes(min: unknown): string {
		const n = Number(min) || 0;
		const h = Math.floor(n / 60);
		const m = n % 60;
		return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
	}
	function taskRef(meta: Record<string, unknown> | null): string {
		return meta && typeof meta.taskRef === 'string' ? meta.taskRef : 'a task';
	}

	function dayLabel(iso: string): string {
		const d = new Date(iso);
		const today = new Date();
		const isSameDay = (a: Date, b: Date) =>
			a.getFullYear() === b.getFullYear() &&
			a.getMonth() === b.getMonth() &&
			a.getDate() === b.getDate();
		const yesterday = new Date(today);
		yesterday.setDate(today.getDate() - 1);
		if (isSameDay(d, today)) return 'Today';
		if (isSameDay(d, yesterday)) return 'Yesterday';
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	}
	function timeLabel(iso: string): string {
		return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
	}

	// Icon + accent colour per event type, used for the small badge that sits
	// on the actor avatar so the feed stays scannable at a glance.
	const TYPE_STYLE: Record<string, { icon: string; color: string }> = {
		'task.created': { icon: 'plus', color: '#5fb87a' },
		'task.deleted': { icon: 'trash', color: '#ef7a6d' },
		'task.status': { icon: 'refresh', color: '#7a9cf0' },
		'task.priority': { icon: 'arrow-up', color: '#e0a458' },
		'task.type': { icon: 'square', color: '#7fc8a9' },
		'task.assignee': { icon: 'users', color: '#a98cf0' },
		'time.logged': { icon: 'calendar', color: '#e0a458' },
		'project.name': { icon: 'settings', color: '#9aa4b2' },
		'project.description': { icon: 'settings', color: '#9aa4b2' },
		'project.status': { icon: 'refresh', color: '#7a9cf0' },
		'project.color': { icon: 'star', color: '#9aa4b2' },
		'member.added': { icon: 'users', color: '#a98cf0' },
		'member.removed': { icon: 'users', color: '#a98cf0' },
		'member.role': { icon: 'users', color: '#a98cf0' },
		'lead.set': { icon: 'star', color: '#a98cf0' },
		'lead.cleared': { icon: 'users', color: '#a98cf0' }
	};
	function typeStyle(type: string) {
		return TYPE_STYLE[type] ?? { icon: 'logs', color: '#9aa4b2' };
	}

	// The display id this row links to, or null when the task isn't openable
	// (project-level row, or the task has since been deleted).
	function openableRef(e: ActivityItem): string | null {
		if (e.type === 'task.deleted' || !e.taskId) return null;
		const ref = e.meta && typeof e.meta.taskRef === 'string' ? e.meta.taskRef : null;
		return ref && openableTasks.has(ref) ? ref : null;
	}
	function openTask(ref: string | null) {
		if (ref) onOpenTask?.(ref);
	}

	// Group consecutive items by day for date headers.
	const grouped = $derived.by(() => {
		const out: { day: string; items: ActivityItem[] }[] = [];
		for (const it of items) {
			const day = dayLabel(it.createdAt);
			const last = out[out.length - 1];
			if (last && last.day === day) last.items.push(it);
			else out.push({ day, items: [it] });
		}
		return out;
	});
</script>

{#snippet refChip(meta: Record<string, unknown> | null)}
	<span
		class="inline-flex items-center px-1.5 py-px rounded-[5px] bg-surface border border-border font-mono text-[11px] text-text-3 align-middle"
	>{taskRef(meta)}</span>
{/snippet}

{#snippet line(e: ActivityItem)}
	<div class="flex-1 min-w-0 text-[12.5px] text-text-2 leading-relaxed">
		<span class="text-text font-medium">{e.actor?.name ?? 'Someone'}</span>
		{#if e.type === 'comment'}
			commented{#if e.taskId} on {@render refChip(e.meta)}{/if}
		{:else if e.type === 'task.created'}
			created {@render refChip(e.meta)}
		{:else if e.type === 'task.deleted'}
			deleted {@render refChip(e.meta)}
		{:else if e.type === 'task.status'}
			changed status of {@render refChip(e.meta)}
			<span class="text-text-3">{humanize(e.meta?.from)}</span> →
			<span class="text-text font-medium">{humanize(e.meta?.to)}</span>
		{:else if e.type === 'task.priority'}
			changed priority of {@render refChip(e.meta)}
			<span class="text-text-3">{humanize(e.meta?.from)}</span> →
			<span class="text-text font-medium">{humanize(e.meta?.to)}</span>
		{:else if e.type === 'task.type'}
			changed type of {@render refChip(e.meta)}
			<span class="text-text-3">{humanize(e.meta?.from)}</span> →
			<span class="text-text font-medium">{humanize(e.meta?.to)}</span>
		{:else if e.type === 'task.assignee'}
			updated assignees of {@render refChip(e.meta)}
		{:else if e.type === 'time.logged'}
			logged <span class="text-text font-medium">{fmtMinutes(e.meta?.minutes)}</span>
			on {@render refChip(e.meta)}
		{:else if e.type === 'project.name'}
			renamed the project to <span class="text-text">{humanize(e.meta?.to)}</span>
		{:else if e.type === 'project.description'}
			updated the project description
		{:else if e.type === 'project.status'}
			changed the project status{#if e.meta?.from} from {humanize(e.meta.from)}{/if}
			to <span class="text-text font-medium">{humanize(e.meta?.to)}</span>
		{:else if e.type === 'project.color'}
			changed the project color
		{:else if e.type === 'member.added'}
			added <span class="text-text">{userName(e.meta?.userId)}</span> as {roleLabel(e.meta?.role)}
		{:else if e.type === 'member.removed'}
			removed <span class="text-text">{userName(e.meta?.userId)}</span>
		{:else if e.type === 'member.role'}
			changed <span class="text-text">{userName(e.meta?.userId)}</span>'s role to {roleLabel(e.meta?.role)}
		{:else if e.type === 'lead.set'}
			set <span class="text-text">{userName(e.meta?.userId)}</span> as project lead
		{:else if e.type === 'lead.cleared'}
			cleared the project lead
		{:else}
			{humanize(e.type)}
		{/if}
	</div>
{/snippet}

<Drawer {open} {onclose} width={460}>
	<div class="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
		<div class="flex items-center gap-2 text-[13.5px] font-medium text-text">
			<Icon name="logs" size={15} /> Project history
		</div>
		<button
			type="button"
			aria-label="Close"
			onclick={onclose}
			class="w-7 h-7 grid place-items-center rounded-md hover:bg-surface-2 text-text-3 hover:text-text"
		>
			<Icon name="x" size={14} />
		</button>
	</div>

	<div class="flex-1 overflow-y-auto px-4 py-4">
		{#if items.length === 0}
			<div class="text-[13px] text-text-3 text-center py-10">No activity yet.</div>
		{:else}
			{#each grouped as g (g.day)}
				<div class="text-[11px] uppercase tracking-[0.08em] text-text-4 mb-3 mt-4 first:mt-0">
					{g.day}
				</div>
				<div class="divide-y divide-border/50">
					{#each g.items as e (e.id)}
						{@const ref = openableRef(e)}
						{@const ts = typeStyle(e.type)}
						<div class="flex gap-3 py-3 first:pt-1">
							<!-- node: actor avatar + type badge -->
							<div class="relative shrink-0 w-[27px] h-[27px] mt-0.5">
								{#if e.actor}
									<Avatar user={e.actor} size={27} ring />
								{:else}
									<span
										class="w-[27px] h-[27px] rounded-full grid place-items-center bg-surface-2 border border-border text-text-4"
									>
										<Icon name="user" size={13} />
									</span>
								{/if}
								{#if e.type !== 'comment'}
									<span
										class="absolute -bottom-1 -right-1 w-[15px] h-[15px] rounded-full grid place-items-center border-2 border-bg-elev text-white"
										style:background={ts.color}
									>
										<Icon name={ts.icon} size={8} stroke={2.4} />
									</span>
								{/if}
							</div>

							<div class="flex-1 min-w-0">
								{#if ref}
									<button
										type="button"
										onclick={() => openTask(ref)}
										title="Open {ref}"
										class="w-full text-left flex items-start gap-3 py-0.5 rounded-lg hover:bg-surface-2 cursor-pointer transition-colors"
									>
										{@render line(e)}
										<time class="shrink-0 text-[11px] text-text-4 font-mono pt-[3px] tabular-nums">
											{timeLabel(e.createdAt)}
										</time>
									</button>
								{:else}
									<div class="flex items-start gap-3 py-0.5">
										{@render line(e)}
										<time class="shrink-0 text-[11px] text-text-4 font-mono pt-[3px] tabular-nums">
											{timeLabel(e.createdAt)}
										</time>
									</div>
								{/if}

								{#if e.type === 'comment'}
									<div
										class="mt-1.5 p-3 rounded-xl rounded-tl-sm bg-surface border border-border text-[13px] leading-relaxed text-text whitespace-pre-wrap"
									>
										{e.body}
									</div>
								{:else if e.type === 'task.assignee'}
									<div class="mt-1 flex flex-wrap gap-1.5 text-[11.5px]">
										{#if Array.isArray(e.meta?.added) && e.meta.added.length}
											<span
												class="inline-flex items-center px-1.5 py-px rounded bg-surface border border-border text-text-2"
											>+{(e.meta.added as string[]).map(userName).join(', ')}</span>
										{/if}
										{#if Array.isArray(e.meta?.removed) && e.meta.removed.length}
											<span
												class="inline-flex items-center px-1.5 py-px rounded bg-surface border border-border text-text-4 line-through"
											>{(e.meta.removed as string[]).map(userName).join(', ')}</span>
										{/if}
									</div>
								{:else if e.type === 'time.logged' && e.meta?.note}
									<div class="mt-1 text-[12.5px] text-text-3 italic">{e.meta.note}</div>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/each}

			{#if canLoadMore && items.length >= 50}
				<button
					type="button"
					onclick={loadMore}
					disabled={loadingMore}
					class="mt-5 w-full py-2 rounded-lg border border-border text-[12.5px] text-text-2 hover:bg-surface-2 disabled:opacity-50"
				>
					{loadingMore ? 'Loading…' : 'Load more'}
				</button>
			{/if}
		{/if}
	</div>

	<div class="p-3 border-t border-border shrink-0">
		<Composer
			bind:value={commentBody}
			placeholder="Add a comment to this project…"
			{sending}
			onsend={sendComment}
		/>
	</div>
</Drawer>
