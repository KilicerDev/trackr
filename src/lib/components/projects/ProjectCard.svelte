<script lang="ts">
	import { PROJECT_STATUS } from '$lib/data';
	import AvatarStack from '../AvatarStack.svelte';
	import type { ProjectListItem } from '../../../routes/(app)/projects/+page.server';

	interface Props {
		project: ProjectListItem;
	}
	let { project }: Props = $props();

	let st = $derived(
		PROJECT_STATUS[project.status as keyof typeof PROJECT_STATUS] ?? PROJECT_STATUS.on_track
	);

	function relative(d: Date): string {
		const ms = Date.now() - d.getTime();
		const m = Math.round(ms / 60_000);
		if (m < 1) return 'just now';
		if (m < 60) return `${m} min ago`;
		const h = Math.round(m / 60);
		if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
		const days = Math.round(h / 24);
		if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
		return d.toISOString().slice(0, 10);
	}
</script>

<a
	href="/projects/{project.id}"
	class="block bg-bg-elev border border-border rounded-2xl p-5 hover:border-border-strong hover:bg-surface/40 transition-colors shadow-[0_1px_0_rgba(255,255,255,0.025)_inset]"
>
	<div class="flex items-start gap-3 mb-3">
		<span
			class="inline-grid place-items-center text-white font-semibold shrink-0 relative"
			style:width="40px"
			style:height="40px"
			style:border-radius="11px"
			style:font-size="20px"
			style:background="linear-gradient(140deg, {project.color}, color-mix(in oklch, {project.color} 70%, #000) 85%)"
			style:box-shadow="0 1px 0 rgba(255,255,255,0.16) inset"
		>
			{project.icon}
		</span>
		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-2">
				<div class="text-[15px] font-semibold text-text truncate">{project.name}</div>
				{#if project.archivedAt}
					<span
						class="text-[10px] uppercase tracking-[0.06em] px-1.5 py-0.5 rounded text-text-3 shrink-0"
						style:background="rgba(154,164,178,0.18)"
					>
						Archived
					</span>
				{/if}
			</div>
			<div class="font-mono text-[11px] text-text-3 flex items-center gap-1.5">
				<span>{project.key}</span>
				{#if project.org}
					<span class="text-text-4">·</span>
					<span class="truncate">{project.org.name}</span>
				{/if}
			</div>
		</div>
		<div class="flex items-center gap-1.5 text-[12px] text-text-2 shrink-0">
			<span class="w-2 h-2 rounded-full" style:background={st.color}></span>
			{st.label}
		</div>
	</div>

	<p class="text-[12.5px] text-text-3 leading-snug mb-5 line-clamp-2 min-h-[2.4em]">
		{project.description ?? 'No description yet.'}
	</p>

	<div class="h-1 rounded-full mb-4" style:background={project.color}></div>

	<div class="flex items-center gap-3">
		<AvatarStack users={project.members} size={22} max={4} />
		<div class="ml-auto text-[11px] text-text-3 text-right">
			{#if project.lead}
				Lead <span class="text-text-2 font-medium">{project.lead.name.split(' ')[0]}</span>
				<span class="text-text-4 mx-1">·</span>
			{/if}
			Updated {relative(project.updatedAt)}
		</div>
	</div>
</a>
