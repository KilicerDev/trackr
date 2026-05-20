<script lang="ts">
	import AvatarStack from '../AvatarStack.svelte';
	import type { ProjectListItem } from '../../../routes/(app)/projects/+page.server';
	import { PROJECT_STATUS } from '$lib/data';

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
		const m = Math.round(ms / 60_000);
		if (m < 1) return 'just now';
		if (m < 60) return `${m}m ago`;
		const h = Math.round(m / 60);
		if (h < 24) return `${h}h ago`;
		const days = Math.round(h / 24);
		if (days < 7) return `${days}d ago`;
		return d.toISOString().slice(0, 10);
	}
</script>

<div class="flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
	<div class="flex h-full">
		{#each columns as col (col.key)}
			<div class="flex flex-col w-[320px] shrink-0 border-r border-border last:border-r-0">
				<div class="flex items-center gap-2 px-4 py-3 border-b border-border">
					<span class="w-2.5 h-2.5 rounded-full" style:background={col.color}></span>
					<span class="text-[13px] font-semibold text-text">{col.label}</span>
					<span class="font-mono text-[11px] text-text-3">{col.projects.length}</span>
				</div>
				<div class="flex-1 overflow-y-auto space-y-2.5 px-3.5 py-3">
					{#each col.projects as p (p.id)}
						{@const st = PROJECT_STATUS[p.status as keyof typeof PROJECT_STATUS] ?? PROJECT_STATUS.active}
						<a
							href="/projects/{p.id}"
							class="block bg-bg-elev border border-border rounded-xl p-3.5 hover:border-border-strong hover:bg-surface/40 transition-colors"
						>
							<div class="flex items-start gap-2.5 mb-2.5">
								<span
									class="inline-grid place-items-center text-white font-semibold shrink-0"
									style:width="30px"
									style:height="30px"
									style:border-radius="9px"
									style:font-size="15px"
									style:background="linear-gradient(140deg, {p.color}, color-mix(in oklch, {p.color} 70%, #000) 85%)"
								>{p.icon}</span>
								<div class="min-w-0 flex-1">
									<div class="text-[13px] font-semibold text-text truncate">{p.name}</div>
									<div class="font-mono text-[10.5px] text-text-3 flex items-center gap-1.5">
										<span>{p.key}</span>
										{#if p.org}
											<span class="text-text-4">·</span>
											<span class="truncate">{p.org.name}</span>
										{/if}
									</div>
								</div>
							</div>
							{#if p.description}
								<p class="text-[11.5px] text-text-3 leading-snug line-clamp-2 mb-2.5">
									{p.description}
								</p>
							{/if}
							<div class="flex items-center gap-2">
								<AvatarStack users={p.members} size={18} max={4} />
								<span
									class="ml-auto inline-flex items-center gap-1 text-[10.5px]"
									style:color={st.color}
								>
									<span class="w-1.5 h-1.5 rounded-full" style:background={st.color}></span>
									{st.label}
								</span>
							</div>
							<div class="text-[10px] text-text-4 mt-1.5">Updated {relative(p.updatedAt)}</div>
						</a>
					{/each}
					{#if col.projects.length === 0}
						<div class="text-center text-[11.5px] text-text-4 py-6">No projects</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>
