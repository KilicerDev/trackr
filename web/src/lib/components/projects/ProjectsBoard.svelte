<script lang="ts">
	import AvatarStack from '../AvatarStack.svelte';
	import Icon from '../Icon.svelte';
	import type { ProjectListItem } from '../../../routes/(app)/projects/+page.server';
	import { m } from '$lib/paraglide/messages';

	export interface BoardColumn {
		key: string;
		label: string;
		color: string;
		projects: ProjectListItem[];
	}

	interface Props {
		// Open the history drawer for a project without navigating.
		onhistory?: (p: ProjectListItem) => void;
		columns: BoardColumn[];
	}
	let { columns, onhistory }: Props = $props();

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
			<!-- Column: quiet header with a hairline (it stays put while the cards
			     scroll), soft dividers — the same as the tasks board. -->
			<div
				class="flex w-[85vw] max-w-[352px] shrink-0 flex-col border-r border-border/50 last:border-r-0"
			>
				<div class="flex h-12 shrink-0 items-center gap-2 border-b border-border/70 px-4">
					<span class="h-2.5 w-2.5 rounded-full" style:background={col.color}></span>
					<span class="truncate text-[14px] font-medium text-text">{col.label}</span>
					<span class="font-mono text-[12px] text-text-4">{col.projects.length}</span>
				</div>
				<div class="flex-1 space-y-2 overflow-y-auto px-3.5 py-3">
					{#each col.projects as p (p.id)}
						<a
							href="/projects/{p.id}"
							class="group block rounded-lg bg-bg-elev px-3 py-2.5 transition-colors hover:bg-surface"
						>
							<div class="flex items-center gap-2.5">
								<span
									class="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md text-[11px] leading-none font-semibold text-white"
									style:background="linear-gradient(140deg, {p.color}, color-mix(in oklch, {p.color} 70%,
									#000) 85%)">{p.icon}</span
								>
								<span class="min-w-0 flex-1 truncate text-[14px] text-text">{p.name}</span>
								{#if onhistory}
									<button
										type="button"
										aria-label={m.projects_aria_history()}
										title={m.projects_aria_history()}
										onclick={(e) => {
											e.preventDefault();
											e.stopPropagation();
											onhistory(p);
										}}
										class="-my-1 grid h-6 w-6 shrink-0 place-items-center rounded-md text-text-3 opacity-0 transition-[opacity,colors] group-hover:opacity-100 hover:bg-surface-2 hover:text-text focus-visible:opacity-100"
									>
										<Icon name="logs" size={13} />
									</button>
								{/if}
							</div>
							{#if p.description}
								<p class="mt-1.5 line-clamp-2 text-[13px] leading-snug text-text-3">
									{p.description}
								</p>
							{/if}
							<div class="mt-2.5 flex items-center gap-2 text-[12px] leading-none text-text-4">
								<span class="font-mono">{p.key}</span>
								{#if p.org}
									<span>·</span>
									<span class="min-w-0 truncate">{p.org.name}</span>
								{/if}
								<span class="ml-auto shrink-0">{relative(p.updatedAt)}</span>
								{#if p.members.length}
									<AvatarStack users={p.members} size={20} max={3} overlap={6} />
								{/if}
							</div>
						</a>
					{/each}
					{#if col.projects.length === 0}
						<div class="py-6 text-center text-[12px] text-text-4">{m.projects_no_projects()}</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>
