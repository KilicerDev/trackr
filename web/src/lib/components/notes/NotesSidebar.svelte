<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import { saveView } from '$lib/stores/view';
	import { m } from '$lib/paraglide/messages';

	type NoteItem = {
		id: string;
		title: string;
		icon: string;
		pinned: boolean;
		updatedAt: Date | string;
		meetingDate?: Date | string | null;
		projectId: string | null;
	};
	type Project = { id: string; name: string; color: string };

	type Tab = 'notes' | 'meetings';

	let {
		mine,
		shared,
		meetings,
		initialTab = 'notes',
		onNewMeeting
	}: {
		mine: NoteItem[];
		shared: NoteItem[];
		meetings: NoteItem[];
		initialTab?: Tab;
		onNewMeeting: () => void;
	} = $props();

	let creating = $state(false);
	const activeId = $derived(page.params.id ?? null);
	const projects = $derived(((page.data as { projects?: Project[] }).projects ?? []) as Project[]);
	const projectById = $derived(new Map(projects.map((p) => [p.id, p])));

	// Active tab. Seeded from the server (layout load) so SSR renders the correct
	// tab with no client-side flicker, then persisted on change to localStorage +
	// server (same mechanism as the tasks list/board view).
	let tab = $state<Tab>(initialTab);
	function setTab(v: Tab) {
		tab = v;
		saveView('notes', { tab: v });
	}

	// Follow the open note into its own tab, but ONLY when the open note actually
	// changes (navigation) — not on every data refresh (e.g. after pinning, which
	// calls invalidateAll), otherwise a manual tab switch gets reverted.
	let lastFollowed = '';
	$effect(() => {
		const id = activeId;
		if (!id || id === lastFollowed) return;
		lastFollowed = id;
		setTab(meetings.some((mtg) => mtg.id === id) ? 'meetings' : 'notes');
	});

	// Apple Calendar-style list grouping: meetings bucketed by day, newest day
	// first, with a relative header (Today / Yesterday / weekday + date).
	function startOfDay(d: Date): number {
		return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	}
	function dayLabel(d: Date): string {
		const today = startOfDay(new Date());
		const day = startOfDay(d);
		const diffDays = Math.round((today - day) / 86400000);
		if (diffDays === 0) return m.notes_day_today();
		if (diffDays === 1) return m.notes_day_yesterday();
		if (diffDays === -1) return m.notes_day_tomorrow();
		return d.toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {})
		});
	}

	const meetingGroups = $derived.by(() => {
		const withDate = meetings.map((n) => ({
			n,
			t: n.meetingDate ? new Date(n.meetingDate).getTime() : 0
		}));
		// Newest meeting day first; undated sink to the bottom.
		withDate.sort((a, b) => b.t - a.t);
		const out: { key: string; label: string; items: NoteItem[] }[] = [];
		for (const { n, t } of withDate) {
			const key = t ? String(startOfDay(new Date(t))) : 'none';
			const label = t ? dayLabel(new Date(t)) : m.notes_no_date();
			let g = out.find((x) => x.key === key);
			if (!g) {
				g = { key, label, items: [] };
				out.push(g);
			}
			g.items.push(n);
		}
		return out;
	});

	async function togglePin(e: Event, id: string, pinned: boolean) {
		e.preventDefault();
		e.stopPropagation();
		const fd = new FormData();
		fd.set('id', id);
		fd.set('pinned', String(!pinned));
		await fetch('/notes?/pin', {
			method: 'POST',
			body: fd,
			headers: { 'x-sveltekit-action': 'true' }
		});
		await invalidateAll();
	}
</script>

<aside class="flex min-h-0 flex-col border-r border-border bg-bg-elev w-[286px]">
	<!-- Tabs + contextual create -->
	<div class="flex items-center gap-2 px-3 pt-3 pb-2.5">
		<div class="flex flex-1 items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5">
			<button
				type="button"
				onclick={() => setTab('notes')}
				class="flex-1 rounded-[6px] px-2 py-1 text-[14px] font-medium transition-colors {tab ===
				'notes'
					? 'bg-bg-elev text-text shadow-sm'
					: 'text-text-3 hover:text-text-2'}"
			>
				{m.notes_section_notes()}
			</button>
			<button
				type="button"
				onclick={() => setTab('meetings')}
				class="flex-1 rounded-[6px] px-2 py-1 text-[14px] font-medium transition-colors {tab ===
				'meetings'
					? 'bg-bg-elev text-text shadow-sm'
					: 'text-text-3 hover:text-text-2'}"
			>
				{m.notes_section_meetings()}
			</button>
		</div>

		{#if tab === 'notes'}
			<form
				method="POST"
				action="/notes?/create"
				use:enhance={() => {
					creating = true;
					return async ({ result }) => {
						creating = false;
						if (result.type === 'success' && result.data?.id)
							await goto(`/notes/${result.data.id}`, { invalidateAll: true });
					};
				}}
			>
				<button
					type="submit"
					disabled={creating}
					aria-label={m.notes_new_note()}
					title={m.notes_new_note()}
					class="grid h-[33px] w-[33px] place-items-center rounded-lg border border-border text-text-2 transition-colors hover:bg-[var(--row-hover)] hover:text-text disabled:opacity-50"
				>
					<Icon name="plus" size={16} />
				</button>
			</form>
		{:else}
			<button
				type="button"
				onclick={onNewMeeting}
				aria-label={m.notes_new_meeting()}
				title={m.notes_new_meeting()}
				class="grid h-[33px] w-[33px] place-items-center rounded-lg border border-border text-text-2 transition-colors hover:bg-[var(--row-hover)] hover:text-text"
			>
				<Icon name="plus" size={16} />
			</button>
		{/if}
	</div>

	<div class="flex-1 overflow-y-auto px-2 pb-3">
		{#if tab === 'notes'}
			{#if mine.length === 0 && shared.length === 0}
				<div class="px-2 py-1.5 text-[13px] text-text-4">{m.notes_sidebar_empty()}</div>
			{/if}
			{#each mine as n (n.id)}
				<a
					href="/notes/{n.id}"
					class="group my-[1px] flex items-center gap-2 rounded-[7px] px-2 py-[8px] text-[14px] transition-colors {activeId ===
					n.id
						? 'bg-[var(--row-active)] text-text'
						: 'text-text-2 hover:bg-[var(--row-hover)] hover:text-text'}"
				>
					<span class="grid h-4 w-4 shrink-0 place-items-center text-text-3">
						<Icon name={n.icon || 'file'} size={15} />
					</span>
					<span class="flex-1 truncate">{n.title || m.notes_untitled()}</span>
					<button
						type="button"
						onclick={(e) => togglePin(e, n.id, n.pinned)}
						aria-label={n.pinned ? m.notes_unpin() : m.notes_pin()}
						class="grid h-5 w-5 place-items-center rounded transition-colors {n.pinned
							? 'text-accent'
							: 'text-text-4 opacity-0 group-hover:opacity-100 hover:text-text-2'}"
					>
						<Icon name="star" size={14} class={n.pinned ? 'fill-current' : ''} />
					</button>
				</a>
			{/each}

			{#if shared.length > 0}
				<div
					class="px-1 pt-3.5 pb-1 text-[12px] font-medium tracking-[0.1em] text-text-4 uppercase"
				>
					{m.notes_shared_with_me()}
				</div>
				{#each shared as n (n.id)}
					<a
						href="/notes/{n.id}"
						class="my-[1px] flex items-center gap-2 rounded-[7px] px-2 py-[8px] text-[14px] transition-colors {activeId ===
						n.id
							? 'bg-[var(--row-active)] text-text'
							: 'text-text-2 hover:bg-[var(--row-hover)] hover:text-text'}"
					>
						<span class="grid h-4 w-4 shrink-0 place-items-center text-text-3">
							<Icon name={n.icon || 'file'} size={15} />
						</span>
						<span class="flex-1 truncate">{n.title || m.notes_untitled()}</span>
						<Icon name="link" size={13} class="shrink-0 text-text-4" />
					</a>
				{/each}
			{/if}
		{:else}
			<!-- Meetings — grouped by day, newest first (Apple Calendar list style) -->
			{#if meetings.length === 0}
				<div class="px-2 py-1.5 text-[13px] text-text-4">{m.notes_meetings_sidebar_empty()}</div>
			{/if}
			{#each meetingGroups as g (g.key)}
				<div class="px-2 pt-2 pb-0.5 text-[12px] font-medium text-text-3">{g.label}</div>
				{#each g.items as n (n.id)}
					{@const proj = n.projectId ? projectById.get(n.projectId) : null}
					<a
						href="/notes/{n.id}"
						class="my-[1px] flex items-start gap-2 rounded-[7px] px-2 py-[8px] text-[14px] transition-colors {activeId ===
						n.id
							? 'bg-[var(--row-active)] text-text'
							: 'text-text-2 hover:bg-[var(--row-hover)] hover:text-text'}"
					>
						<span class="mt-px grid h-4 w-4 shrink-0 place-items-center text-text-3">
							<Icon name={n.icon || 'users'} size={15} />
						</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate">{n.title || m.notes_untitled()}</span>
							{#if proj}
								<span class="mt-0.5 flex items-center gap-1.5 text-[12px] text-text-4">
									<span class="h-2 w-2 shrink-0 rounded-[2.5px]" style:background={proj.color}
									></span>
									<span class="truncate">{proj.name}</span>
								</span>
							{/if}
						</span>
					</a>
				{/each}
			{/each}
		{/if}
	</div>

	<!-- Footer: templates -->
	<div class="border-t border-border px-2 py-2">
		<a
			href="/notes/templates"
			class="flex items-center gap-2 rounded-md px-2 py-1.5 text-[14px] transition-colors {page
				.url.pathname === '/notes/templates'
				? 'text-text'
				: 'text-text-3 hover:bg-[var(--row-hover)] hover:text-text'}"
		>
			<Icon name="bookmark" size={14} />
			{m.notes_templates_title()}
		</a>
	</div>
</aside>
