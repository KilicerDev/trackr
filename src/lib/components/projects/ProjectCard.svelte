<script lang="ts">
	import type { ProjectId } from '$lib/types';
	import { TRACKR_PROJECTS, PROJECT_STATUS, TRACKR_TASKS, userById } from '$lib/data';
	import ProjectIcon from '../ProjectIcon.svelte';
	import AvatarStack from '../AvatarStack.svelte';

	interface Props {
		id: ProjectId;
	}
	let { id }: Props = $props();
	let p = $derived(TRACKR_PROJECTS[id]);
	let st = $derived(PROJECT_STATUS[p.status]);

	let stats = $derived.by(() => {
		const tasks = TRACKR_TASKS.filter((t) => t.project === id);
		const done = tasks.filter((t) => t.status === 'done' || t.status === 'in_review').length;
		const active = tasks.filter((t) => t.status === 'in_progress' || t.status === 'paused').length;
		const total = tasks.length;
		const pct = total === 0 ? 0 : Math.round((done / total) * 100);
		return { total, active, done, pct };
	});

	let lead = $derived(userById(p.lead));
	let members = $derived(p.members.map((id) => userById(id)));
</script>

<a
	href="/projects/{id}"
	class="block bg-bg-elev border border-border rounded-2xl p-5 hover:border-border-strong hover:bg-surface/40 transition-colors shadow-[0_1px_0_rgba(255,255,255,0.025)_inset]"
>
	<div class="flex items-start gap-3 mb-3">
		<ProjectIcon {id} size={40} radius={11} />
		<div class="min-w-0 flex-1">
			<div class="text-[15px] font-semibold text-text truncate">{p.name}</div>
			<div class="font-mono text-[11px] text-text-3">{id}</div>
		</div>
		<div class="flex items-center gap-1.5 text-[12px] text-text-2 shrink-0">
			<span class="w-2 h-2 rounded-full" style:background={st.color}></span>
			{st.label}
		</div>
	</div>

	<p class="text-[12.5px] text-text-3 leading-snug mb-5 line-clamp-2">{p.description}</p>

	<div class="grid grid-cols-4 gap-2 mb-3">
		<div>
			<div class="text-[10.5px] uppercase tracking-[0.08em] text-text-4">Total</div>
			<div class="font-mono text-[18px] font-semibold text-text mt-0.5">{stats.total}</div>
		</div>
		<div>
			<div class="text-[10.5px] uppercase tracking-[0.08em] text-text-4">Active</div>
			<div class="font-mono text-[18px] font-semibold text-[#f0a85c] mt-0.5">{stats.active}</div>
		</div>
		<div>
			<div class="text-[10.5px] uppercase tracking-[0.08em] text-text-4">Done</div>
			<div class="font-mono text-[18px] font-semibold text-[#7fc8a9] mt-0.5">{stats.done}</div>
		</div>
		<div>
			<div class="text-[10.5px] uppercase tracking-[0.08em] text-text-4">Progress</div>
			<div class="font-mono text-[18px] font-semibold mt-0.5">
				{stats.pct}<span class="text-text-3 text-[12px]">%</span>
			</div>
		</div>
	</div>

	<div class="h-1.5 rounded-full bg-surface overflow-hidden mb-4">
		<div class="h-full transition-[width] duration-300" style:width="{stats.pct}%" style:background={p.color}></div>
	</div>

	<div class="flex items-center gap-3">
		<AvatarStack users={members} size={22} max={4} />
		<div class="ml-auto text-[11px] text-text-3 text-right">
			Lead <span class="text-text-2 font-medium">{lead?.name.split(' ')[0]}</span>
			<span class="text-text-4 mx-1">·</span>
			Updated {p.updated}
		</div>
	</div>
</a>
