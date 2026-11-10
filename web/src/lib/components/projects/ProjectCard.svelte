<script lang="ts">
	import { PROJECT_STATUS } from '$lib/config/taxonomy';
	import { projectStatusLabel } from '$lib/utils/labels';
	import { m } from '$lib/paraglide/messages';
	import AvatarStack from '../AvatarStack.svelte';
	import Icon from '../Icon.svelte';
	import { TAG } from '../tasks/panel/styles';
	import { labelMeta } from '$lib/utils/label-meta';
	import type { ProjectListItem } from '../../../routes/(app)/projects/+page.server';

	interface Props {
		project: ProjectListItem;
		// Opens the history drawer in place (weekly-review flow) — the card
		// itself still navigates to the project.
		onhistory?: () => void;
	}
	let { project, onhistory }: Props = $props();

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

<!-- Calm card: no border, a soft surface that brightens on hover (like the
     board cards); one meta line; tags as small pills; footer with the team. -->
<a
	href="/projects/{project.id}"
	class="group flex flex-col rounded-xl bg-bg-elev p-4 transition-colors hover:bg-surface"
>
	<div class="flex items-start gap-3">
		<span
			class="grid size-8 shrink-0 place-items-center rounded-[9px] text-[15px] leading-none font-semibold text-white shadow-edge"
			style:background="linear-gradient(140deg, {project.color}, color-mix(in oklch, {project.color} 70%,
			#000) 85%)"
		>
			{project.icon}
		</span>
		<div class="min-w-0 flex-1">
			<div class="truncate text-[15px] leading-5 font-medium text-text">{project.name}</div>
			<div class="mt-0.5 flex items-center gap-1.5 text-[12px] leading-4 text-text-4">
				<span class="font-mono">{project.key}</span>
				{#if project.org}
					<span>·</span>
					<span class="truncate">{project.org.name}</span>
				{/if}
			</div>
		</div>
		<span class="flex shrink-0 items-center gap-1.5 text-[12px] leading-5 text-text-3">
			<span class="h-2 w-2 rounded-full" style:background={st.color}></span>
			{projectStatusLabel(project.status)}
		</span>
	</div>

	<p
		class="mt-3 line-clamp-2 min-h-[2.6em] text-[13px] leading-snug {project.description
			? 'text-text-3'
			: 'text-text-4'}"
	>
		{project.description ?? m.projects_no_description()}
	</p>

	{#if project.tags?.length}
		<div class="mt-3 flex flex-wrap items-center gap-1">
			{#each project.tags.slice(0, 3) as t (t)}
				{@const l = labelMeta(t)}
				<span class={TAG}>
					<span class="h-1.5 w-1.5 shrink-0 rounded-full" style:background={l.color}></span>
					<span class="max-w-[120px] truncate">{l.label}</span>
				</span>
			{/each}
			{#if project.tags.length > 3}
				<span class="text-[12px] text-text-4">+{project.tags.length - 3}</span>
			{/if}
		</div>
	{/if}

	<div class="mt-auto flex items-center gap-2 pt-4 text-[12px] leading-none text-text-4">
		<AvatarStack users={project.members} size={22} max={4} overlap={6} />
		<span class="ml-auto truncate">
			{#if project.lead}
				{m.projects_lead_label()}
				<span class="text-text-3">{project.lead.name.split(' ')[0]}</span>
				<span class="mx-1">·</span>
			{/if}
			{relative(project.updatedAt)}
		</span>
		{#if onhistory}
			<button
				type="button"
				aria-label={m.projects_aria_history()}
				title={m.projects_aria_history()}
				onclick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					onhistory();
				}}
				class="-my-1 grid h-6 w-6 shrink-0 place-items-center rounded-md text-text-3 opacity-0 transition-[opacity,colors] group-hover:opacity-100 hover:bg-surface-2 hover:text-text focus-visible:opacity-100"
			>
				<Icon name="logs" size={13} />
			</button>
		{/if}
	</div>
</a>
