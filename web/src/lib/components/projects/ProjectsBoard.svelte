<script lang="ts">
	import AvatarStack from '../AvatarStack.svelte';
	import type { ProjectListItem } from '../../../routes/(app)/projects/+page.server';
	import { PROJECT_STATUS } from '$lib/data';
	import { projectStatusLabel } from '$lib/labels';
	import { m } from '$lib/paraglide/messages';

	export interface BoardColumn {
		key: string;
		label: string;
		color: string;
		projects: ProjectListItem[];
	}

	interface Props {
		columns: BoardColumn[];
	}
	let { columns }: Props = $props();

	function relative(d: Date): string {
		const ms = Date.now() - d.getTime();
		const mins = Math.round(ms / 60_000);
		if (mins < 1) return m.projects_just_now();
		if (mins < 60) return m.projects_min_ago({ n: mins });
		const h = Math.round(mins / 60);
		if (h < 24) return m.projects_hours_ago({ n: h });
		const days = Math.round(h / 24);
		if (days < 7) return m.projects_days_ago({ n: days });
		return d.toISOString().slice(0, 10);
	}
</script>

<div class="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
	<div class="flex h-full">
		{#each columns as col (col.key)}
			<div class="flex w-[320px] shrink-0 flex-col border-r border-border last:border-r-0">
				<div class="flex items-center gap-2 border-b border-border px-4 py-3">
					<span class="h-2.5 w-2.5 rounded-full" style:background={col.color}></span>
					<span class="text-[13px] font-semibold text-text">{col.label}</span>
					<span class="font-mono text-[11px] text-text-3">{col.projects.length}</span>
				</div>
				<div class="flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3">
					{#each col.projects as p (p.id)}
						{@const st =
							PROJECT_STATUS[p.status as keyof typeof PROJECT_STATUS] ?? PROJECT_STATUS.active}
						<a
							href="/projects/{p.id}"
							class="block rounded-xl border border-border bg-bg-elev p-3.5 transition-colors hover:border-border-strong hover:bg-surface/40"
						>
							<div class="mb-2.5 flex items-start gap-2.5">
								<span
									class="inline-grid shrink-0 place-items-center font-semibold text-white"
									style:width="30px"
									style:height="30px"
									style:border-radius="9px"
									style:font-size="15px"
									style:background="linear-gradient(140deg, {p.color}, color-mix(in oklch, {p.color} 70%,
									#000) 85%)">{p.icon}</span
								>
								<div class="min-w-0 flex-1">
									<div class="truncate text-[13px] font-semibold text-text">{p.name}</div>
									<div class="flex items-center gap-1.5 font-mono text-[10.5px] text-text-3">
										<span>{p.key}</span>
										{#if p.org}
											<span class="text-text-4">·</span>
											<span class="truncate">{p.org.name}</span>
										{/if}
									</div>
								</div>
							</div>
							{#if p.description}
								<p class="mb-2.5 line-clamp-2 text-[11.5px] leading-snug text-text-3">
									{p.description}
								</p>
							{/if}
							<div class="flex items-center gap-2">
								<AvatarStack users={p.members} size={18} max={4} />
								<span
									class="ml-auto inline-flex items-center gap-1 text-[10.5px]"
									style:color={st.color}
								>
									<span class="h-1.5 w-1.5 rounded-full" style:background={st.color}></span>
									{projectStatusLabel(p.status)}
								</span>
							</div>
							<div class="mt-1.5 text-[10px] text-text-4">
								{m.projects_updated_relative({ time: relative(p.updatedAt) })}
							</div>
						</a>
					{/each}
					{#if col.projects.length === 0}
						<div class="py-6 text-center text-[11.5px] text-text-4">{m.projects_no_projects()}</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>
