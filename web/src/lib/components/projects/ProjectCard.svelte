<script lang="ts">
	import { PROJECT_STATUS } from '$lib/data';
	import { projectStatusLabel } from '$lib/labels';
	import { m } from '$lib/paraglide/messages';
	import AvatarStack from '../AvatarStack.svelte';
	import type { ProjectListItem } from '../../../routes/(app)/projects/+page.server';

	interface Props {
		project: ProjectListItem;
	}
	let { project }: Props = $props();

	let st = $derived(
		PROJECT_STATUS[project.status as keyof typeof PROJECT_STATUS] ?? PROJECT_STATUS.active
	);

	function relative(d: Date): string {
		const ms = Date.now() - d.getTime();
		const mins = Math.round(ms / 60_000);
		if (mins < 1) return m.projects_just_now();
		if (mins < 60) return m.projects_min_ago({ n: mins });
		const h = Math.round(mins / 60);
		if (h < 24)
			return h === 1 ? m.projects_hour_ago_one({ n: h }) : m.projects_hours_ago_other({ n: h });
		const days = Math.round(h / 24);
		if (days < 7)
			return days === 1
				? m.projects_day_ago_one({ n: days })
				: m.projects_days_ago_other({ n: days });
		return d.toISOString().slice(0, 10);
	}
</script>

<a
	href="/projects/{project.id}"
	class="block rounded-2xl border border-border bg-bg-elev p-5 shadow-[0_1px_0_rgba(255,255,255,0.025)_inset] transition-colors hover:border-border-strong hover:bg-surface/40"
>
	<div class="mb-3 flex items-start gap-3">
		<span
			class="relative inline-grid shrink-0 place-items-center font-semibold text-white"
			style:width="40px"
			style:height="40px"
			style:border-radius="11px"
			style:font-size="20px"
			style:background="linear-gradient(140deg, {project.color}, color-mix(in oklch, {project.color} 70%,
			#000) 85%)"
			style:box-shadow="0 1px 0 rgba(255,255,255,0.16) inset"
		>
			{project.icon}
		</span>
		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-2">
				<div class="truncate text-[15px] font-semibold text-text">{project.name}</div>
			</div>
			<div class="flex items-center gap-1.5 font-mono text-[11px] text-text-3">
				<span>{project.key}</span>
				{#if project.org}
					<span class="text-text-4">·</span>
					<span class="truncate">{project.org.name}</span>
				{/if}
			</div>
		</div>
		<div class="flex shrink-0 items-center gap-1.5 text-[12px] text-text-2">
			<span class="h-2 w-2 rounded-full" style:background={st.color}></span>
			{projectStatusLabel(project.status)}
		</div>
	</div>

	<p class="mb-5 line-clamp-2 min-h-[2.4em] text-[12.5px] leading-snug text-text-3">
		{project.description ?? m.projects_no_description()}
	</p>

	<div class="mb-4 h-1 rounded-full" style:background={project.color}></div>

	<div class="flex items-center gap-3">
		<AvatarStack users={project.members} size={22} max={4} />
		<div class="ml-auto text-right text-[11px] text-text-3">
			{#if project.lead}
				{m.projects_lead_label()}
				<span class="font-medium text-text-2">{project.lead.name.split(' ')[0]}</span>
				<span class="mx-1 text-text-4">·</span>
			{/if}
			{m.projects_updated_relative({ time: relative(project.updatedAt) })}
		</div>
	</div>
</a>
