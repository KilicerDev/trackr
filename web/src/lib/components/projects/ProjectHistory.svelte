<script lang="ts">
	import Drawer from '$lib/components/Drawer.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Composer from '$lib/components/Composer.svelte';
	import MentionText from '$lib/components/MentionText.svelte';
	import { resolveUser } from '$lib/stores/lookup.svelte';
	import { invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import { showToast } from '$lib/stores/toast.svelte';
	import { m } from '$lib/paraglide/messages';
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
		// Scopes the comment composer's @-mention list to people who can
		// access this project (internal staff + explicit members).
		projectId?: string | null;
		// Display ids of tasks still loadable on the page; refs not in here
		// (deleted/archived) render as plain text rather than a link.
		taskIds?: string[];
		onOpenTask?: (ref: string) => void;
		// Route whose ?/activity and ?/commentAdd actions to call. Empty (the
		// default) keeps the detail page's relative fetches; the projects list
		// passes `/projects/<id>` so the drawer works from any page.
		actionBase?: string;
		// After a successful comment. Hosts that own `activity` locally (the
		// projects list) refresh it here; without it we invalidateAll(), which
		// refreshes the detail page's server-loaded feed.
		oncommented?: () => void;
	}
	let {
		open,
		onclose,
		activity,
		projectId = null,
		taskIds = [],
		onOpenTask,
		actionBase = '',
		oncommented
	}: Props = $props();

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
			const res = await fetch(`${actionBase}?/activity`, {
				method: 'POST',
				body: fd,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result: ActionResult = deserialize(await res.text());
			if (result.type === 'success') {
				const next = (result.data as { items?: ActivityItem[] } | undefined)?.items ?? [];
				if (next.length === 0) canLoadMore = false;
				extra = [...extra, ...next];
			}
		} catch {
			showToast('err', m.projects_load_more_failed());
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
			const res = await fetch(`${actionBase}?/commentAdd`, {
				method: 'POST',
				body: fd,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result: ActionResult = deserialize(await res.text());
			if (result.type === 'success') {
				commentBody = '';
				if (oncommented) oncommented();
				else await invalidateAll();
			} else {
				const msg =
					result.type === 'failure'
						? ((result.data as { message?: string } | undefined)?.message ??
							m.projects_comment_failed())
						: m.projects_comment_failed();
				showToast('err', msg);
			}
		} catch {
			showToast('err', m.projects_network_error());
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
		return meta && typeof meta.taskRef === 'string' ? meta.taskRef : m.projects_history_a_task();
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
		if (isSameDay(d, today)) return m.projects_history_day_today();
		if (isSameDay(d, yesterday)) return m.projects_history_day_yesterday();
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
		'task.dependency': { icon: 'link', color: '#e9c46a' },
		'time.logged': { icon: 'calendar', color: '#e0a458' },
		'project.name': { icon: 'settings', color: '#9aa4b2' },
		'project.description': { icon: 'settings', color: '#9aa4b2' },
		'project.status': { icon: 'refresh', color: '#7a9cf0' },
		'project.color': { icon: 'star', color: '#9aa4b2' },
		'project.tags': { icon: 'bookmark', color: '#9aa4b2' },
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
		class="inline-flex items-center rounded-[5px] border border-border bg-surface px-1.5 py-px align-middle font-mono text-[12px] text-text-3"
		>{taskRef(meta)}</span
	>
{/snippet}

{#snippet line(e: ActivityItem)}
	<div class="min-w-0 flex-1 text-[14px] leading-relaxed text-text-2">
		<span class="font-medium text-text">{e.actor?.name ?? m.projects_history_someone()}</span>
		{#if e.type === 'comment'}
			{m.projects_history_commented()}{#if e.taskId}
				{m.projects_history_commented_on()} {@render refChip(e.meta)}{/if}
		{:else if e.type === 'task.created'}
			{m.projects_history_created()} {@render refChip(e.meta)}
		{:else if e.type === 'task.deleted'}
			{m.projects_history_deleted()} {@render refChip(e.meta)}
		{:else if e.type === 'task.status'}
			{m.projects_history_changed_status_of()}
			{@render refChip(e.meta)}
			<span class="text-text-3">{humanize(e.meta?.from)}</span> →
			<span class="font-medium text-text">{humanize(e.meta?.to)}</span>
		{:else if e.type === 'task.priority'}
			{m.projects_history_changed_priority_of()}
			{@render refChip(e.meta)}
			<span class="text-text-3">{humanize(e.meta?.from)}</span> →
			<span class="font-medium text-text">{humanize(e.meta?.to)}</span>
		{:else if e.type === 'task.type'}
			{m.projects_history_changed_type_of()}
			{@render refChip(e.meta)}
			<span class="text-text-3">{humanize(e.meta?.from)}</span> →
			<span class="font-medium text-text">{humanize(e.meta?.to)}</span>
		{:else if e.type === 'task.assignee'}
			{m.projects_history_updated_assignees_of()} {@render refChip(e.meta)}
		{:else if e.type === 'task.dependency'}
			{m.projects_history_updated_dependencies_of()} {@render refChip(e.meta)}
		{:else if e.type === 'time.logged'}
			{m.projects_history_logged()}
			<span class="font-medium text-text">{fmtMinutes(e.meta?.minutes)}</span>
			{m.projects_history_on()}
			{@render refChip(e.meta)}
		{:else if e.type === 'project.name'}
			{m.projects_history_renamed_to()} <span class="text-text">{humanize(e.meta?.to)}</span>
		{:else if e.type === 'project.description'}
			{m.projects_history_updated_description()}
		{:else if e.type === 'project.status'}
			{m.projects_history_changed_status()}{#if e.meta?.from}
				{m.projects_history_from()} {humanize(e.meta.from)}{/if}
			{m.projects_history_to()} <span class="font-medium text-text">{humanize(e.meta?.to)}</span>
		{:else if e.type === 'project.color'}
			{m.projects_history_changed_color()}
		{:else if e.type === 'project.tags'}
			{m.projects_history_updated_tags()}
		{:else if e.type === 'member.added'}
			{m.projects_history_added_as({
				user: userName(e.meta?.userId),
				role: roleLabel(e.meta?.role)
			})}
		{:else if e.type === 'member.removed'}
			{m.projects_history_removed()} <span class="text-text">{userName(e.meta?.userId)}</span>
		{:else if e.type === 'member.role'}
			{m.projects_history_changed_role_to({
				user: userName(e.meta?.userId),
				role: roleLabel(e.meta?.role)
			})}
		{:else if e.type === 'lead.set'}
			{m.projects_history_set_as_lead({
				user: userName(e.meta?.userId)
			})}
		{:else if e.type === 'lead.cleared'}
			{m.projects_history_cleared_lead()}
		{:else}
			{humanize(e.type)}
		{/if}
	</div>
{/snippet}

<Drawer {open} {onclose} width={460}>
	<div class="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
		<div class="flex items-center gap-2 text-[14px] font-medium text-text">
			<Icon name="logs" size={16} />
			{m.projects_history_title()}
		</div>
		<button
			type="button"
			aria-label={m.common_close()}
			onclick={onclose}
			class="grid h-7 w-7 place-items-center rounded-md text-text-3 hover:bg-surface-2 hover:text-text"
		>
			<Icon name="x" size={15} />
		</button>
	</div>

	<div class="flex-1 overflow-y-auto px-4 py-4">
		{#if items.length === 0}
			<div class="py-10 text-center text-[14px] text-text-3">{m.projects_no_activity()}</div>
		{:else}
			{#each grouped as g (g.day)}
				<div class="mt-4 mb-3 text-[12px] tracking-[0.08em] text-text-4 uppercase first:mt-0">
					{g.day}
				</div>
				<div class="divide-y divide-border/50">
					{#each g.items as e (e.id)}
						{@const ref = openableRef(e)}
						{@const ts = typeStyle(e.type)}
						<div class="flex gap-3 py-3 first:pt-1">
							<!-- node: actor avatar + type badge -->
							<div class="relative mt-0.5 h-[30px] w-[30px] shrink-0">
								{#if e.actor}
									<Avatar user={e.actor} size={30} ring />
								{:else}
									<span
										class="grid h-[30px] w-[30px] place-items-center rounded-full border border-border bg-surface-2 text-text-4"
									>
										<Icon name="user" size={14} />
									</span>
								{/if}
								{#if e.type !== 'comment'}
									<span
										class="absolute -right-1 -bottom-1 grid h-[16px] w-[16px] place-items-center rounded-full border-2 border-bg-elev text-white"
										style:background={ts.color}
									>
										<Icon name={ts.icon} size={9} stroke={2.4} />
									</span>
								{/if}
							</div>

							<div class="min-w-0 flex-1">
								{#if ref}
									<button
										type="button"
										onclick={() => openTask(ref)}
										title={m.projects_open_ref({ ref })}
										class="flex w-full cursor-pointer items-start gap-3 rounded-lg py-0.5 text-left transition-colors hover:bg-surface-2"
									>
										{@render line(e)}
										<time class="shrink-0 pt-[4px] font-mono text-[12px] text-text-4 tabular-nums">
											{timeLabel(e.createdAt)}
										</time>
									</button>
								{:else}
									<div class="flex items-start gap-3 py-0.5">
										{@render line(e)}
										<time class="shrink-0 pt-[4px] font-mono text-[12px] text-text-4 tabular-nums">
											{timeLabel(e.createdAt)}
										</time>
									</div>
								{/if}

								{#if e.type === 'comment'}
									<div
										class="mt-1.5 rounded-xl rounded-tl-sm border border-border bg-surface p-3 text-[14px] leading-relaxed whitespace-pre-wrap text-text"
									>
										<MentionText text={e.body} />
									</div>
								{:else if e.type === 'task.assignee' || e.type === 'task.dependency'}
									{@const label = e.type === 'task.assignee' ? userName : (ref: string) => ref}
									<div
										class="mt-1 flex flex-wrap gap-1.5 text-[12px] {e.type === 'task.dependency'
											? 'font-mono'
											: ''}"
									>
										{#if Array.isArray(e.meta?.added) && e.meta.added.length}
											<span
												class="inline-flex items-center rounded border border-border bg-surface px-1.5 py-px text-text-2"
												>+{(e.meta.added as string[]).map(label).join(', ')}</span
											>
										{/if}
										{#if Array.isArray(e.meta?.removed) && e.meta.removed.length}
											<span
												class="inline-flex items-center rounded border border-border bg-surface px-1.5 py-px text-text-4 line-through"
												>{(e.meta.removed as string[]).map(label).join(', ')}</span
											>
										{/if}
									</div>
								{:else if e.type === 'time.logged' && e.meta?.note}
									<div class="mt-1 text-[14px] text-text-3 italic">{e.meta.note}</div>
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
					class="mt-5 w-full rounded-lg border border-border py-2 text-[14px] text-text-2 hover:bg-surface-2 disabled:opacity-50"
				>
					{loadingMore ? m.common_loading() : m.projects_load_more()}
				</button>
			{/if}
		{/if}
	</div>

	<div class="shrink-0 border-t border-border p-3">
		<Composer
			bind:value={commentBody}
			placeholder={m.projects_comment_placeholder()}
			{sending}
			{projectId}
			refTypes={['task', 'ticket', 'project']}
			onsend={sendComment}
		/>
	</div>
</Drawer>
