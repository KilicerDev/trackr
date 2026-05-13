<script lang="ts">
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Button from '$lib/components/Button.svelte';
	import IconButton from '$lib/components/IconButton.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import StatusDot from '$lib/components/StatusDot.svelte';
	import PriorityBars from '$lib/components/PriorityBars.svelte';
	import Inspector from '$lib/components/tasks/Inspector.svelte';
	import CreateTaskModal from '$lib/components/tasks/CreateTaskModal.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import {
		PROJECT_STATUS,
		TRACKR_PROJECTS,
		TRACKR_STATUSES,
		TRACKR_TASKS,
		formatDateShort,
		userById
	} from '$lib/data';
	import type { Task } from '$lib/types';

	let { data } = $props();
	let p = $derived(TRACKR_PROJECTS[data.id]);
	let st = $derived(PROJECT_STATUS[p.status]);
	let tasks = $derived(TRACKR_TASKS.filter((t) => t.project === data.id));

	let total = $derived(tasks.length);
	let active = $derived(tasks.filter((t) => t.status === 'in_progress' || t.status === 'paused').length);
	let done = $derived(tasks.filter((t) => t.status === 'done' || t.status === 'in_review').length);
	let pct = $derived(total === 0 ? 0 : Math.round((done / total) * 100));

	let groups = $derived(
		TRACKR_STATUSES.map((s) => ({
			...s,
			tasks: tasks.filter((t) => t.status === s.id)
		})).filter((g) => g.tasks.length > 0)
	);

	let selected = $state<Task | null>(null);
	let creating = $state(false);
</script>

<svelte:head><title>Trackr · {p.name}</title></svelte:head>

<Topbar crumbs={[{ label: 'Trackr Workspace', href: '/tasks' }, { label: 'Projects', href: '/projects' }, { label: p.name }]} />

<div class="flex-1 min-h-0 overflow-y-auto">
	<div class="px-6 py-6">
		<!-- back nav -->
		<a href="/projects" class="inline-flex items-center gap-1.5 text-[12.5px] text-text-3 hover:text-text mb-5">
			<Icon name="chevron-r" size={11} class="rotate-180" /> Projects
		</a>

		<!-- hero -->
		<div class="flex items-start gap-4 mb-5">
			<div class="w-12 h-12 rounded-xl grid place-items-center text-white font-semibold text-[20px] shrink-0" style:background={p.color}>{p.icon}</div>
			<div class="flex-1 min-w-0">
				<h1 class="text-[26px] font-semibold tracking-[-0.014em] text-text">{p.name}</h1>
				<div class="flex items-center gap-2 mt-1.5 text-[12.5px] text-text-3">
					<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11.5px]" style:background={st.color + '24'} style:color={st.color}>
						<span class="w-1.5 h-1.5 rounded-full" style:background={st.color}></span>
						{st.label}
					</span>
					<span class="text-text-4">·</span>
					<span>Updated {p.updated}</span>
				</div>
			</div>
			<div class="flex items-center gap-2">
				<IconButton ariaLabel="Share"><Icon name="link" size={14} /></IconButton>
				<IconButton ariaLabel="Settings"><Icon name="settings" size={14} /></IconButton>
				<Button variant="primary" size="sm" onclick={() => (creating = true)}>
					<Icon name="plus" size={13} /> New task
				</Button>
			</div>
		</div>

		<!-- summary + members -->
		<div class="grid gap-5 mb-6" style:grid-template-columns="1fr 1fr">
			<div class="bg-bg-elev border border-border rounded-2xl p-4">
				<div class="text-[11px] uppercase tracking-[0.08em] text-text-4 mb-1.5">About</div>
				<p class="text-[13.5px] text-text-2 leading-relaxed">{p.description}</p>
			</div>
			<div class="bg-bg-elev border border-border rounded-2xl p-4">
				<div class="text-[11px] uppercase tracking-[0.08em] text-text-4 mb-2.5">Members · {p.members.length}</div>
				<div class="flex flex-wrap gap-1.5">
					{#each p.members as id (id)}
						{@const u = userById(id)}
						<div class="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-surface border border-border text-[12px]">
							<Avatar user={u} size={18} />
							<span class="text-text">{u?.name.split(' ')[0]}</span>
							{#if id === p.lead}
								<span class="text-[10px] uppercase tracking-[0.06em] px-1.5 py-0.5 rounded bg-accent-soft text-accent" style:background="rgba(239,122,109,0.14)">Lead</span>
							{/if}
						</div>
					{/each}
					<button class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-border text-[12px] text-text-3 hover:text-text hover:border-border-strong transition-colors">
						<Icon name="plus" size={11} /> Add
					</button>
				</div>
			</div>
		</div>

		<!-- stats -->
		<div class="grid grid-cols-4 gap-3 mb-7">
			<div class="bg-bg-elev border border-border rounded-2xl p-4">
				<div class="text-[11px] uppercase tracking-[0.08em] text-text-4">Total tasks</div>
				<div class="font-mono text-[24px] font-semibold mt-1.5">{total}</div>
			</div>
			<div class="bg-bg-elev border border-border rounded-2xl p-4">
				<div class="text-[11px] uppercase tracking-[0.08em] text-text-4">In progress</div>
				<div class="font-mono text-[24px] font-semibold mt-1.5 text-[#f0a85c]">{active}</div>
			</div>
			<div class="bg-bg-elev border border-border rounded-2xl p-4">
				<div class="text-[11px] uppercase tracking-[0.08em] text-text-4">Completed</div>
				<div class="font-mono text-[24px] font-semibold mt-1.5 text-[#7fc8a9]">{done}</div>
			</div>
			<div class="bg-bg-elev border border-border rounded-2xl p-4">
				<div class="text-[11px] uppercase tracking-[0.08em] text-text-4 mb-1.5">Progress</div>
				<div class="font-mono text-[24px] font-semibold mb-2">{pct}<span class="text-text-3 text-[14px]">%</span></div>
				<div class="h-1.5 rounded-full bg-surface overflow-hidden">
					<div class="h-full" style:width="{pct}%" style:background={p.color}></div>
				</div>
			</div>
		</div>

		<!-- tasks -->
		<div class="bg-bg-elev border border-border rounded-2xl overflow-hidden">
			<div class="flex items-center gap-2.5 px-4 py-3 border-b border-border">
				<span class="text-[14px] font-semibold">Tasks</span>
				<span class="font-mono text-[11px] text-text-3">{tasks.length}</span>
			</div>
			{#if tasks.length === 0}
				<EmptyState icon="check-square" title="No tasks yet" hint="Click New task to get started." />
			{:else}
				{#each groups as g (g.id)}
					<div class="flex items-center gap-2 px-4 py-2 bg-surface/30 border-b border-border">
						<span class="w-2 h-2 rounded-full" style:background={g.dot}></span>
						<span class="text-[12px] font-semibold text-text">{g.label}</span>
						<span class="font-mono text-[11px] text-text-3">{g.tasks.length}</span>
					</div>
					{#each g.tasks as t (t.id)}
						<button
							type="button"
							onclick={() => (selected = t)}
							class="w-full flex items-center gap-3 px-4 py-2.5 border-b border-border/40 hover:bg-[var(--row-hover)] transition-colors text-left"
						>
							<StatusDot status={t.status} />
							<span class="font-mono text-[11.5px] text-text-3 w-[78px] shrink-0">{t.id}</span>
							<span class="text-[13px] text-text truncate flex-1">{t.title}</span>
							{#if t.priority !== 'none'}<PriorityBars priority={t.priority} />{/if}
							<span class="font-mono text-[11px] text-text-3 w-16 text-right">
								{#if t.endDate}{formatDateShort(t.endDate)}{:else if t.due}{formatDateShort(t.due)}{:else}—{/if}
							</span>
							<Avatar user={userById(t.assignee)} size={20} />
						</button>
					{/each}
				{/each}
			{/if}
		</div>
	</div>
</div>

<Inspector task={selected} onclose={() => (selected = null)} />

<CreateTaskModal
	open={creating}
	prefill={{ project: data.id }}
	onclose={() => (creating = false)}
/>
