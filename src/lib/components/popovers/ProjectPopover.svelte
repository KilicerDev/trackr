<script lang="ts">
	import { clickOutside } from '$lib/actions/clickOutside';
	import { autoPlace } from '$lib/actions/autoPlace';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/motion';
	import Icon from '../Icon.svelte';
	import { TRACKR_PROJECTS } from '$lib/data';
	import type { ProjectId } from '$lib/types';

	type PickableProject = { key: string; name: string; color: string };

	interface Props {
		value: ProjectId;
		onchange: (v: ProjectId) => void;
		onclose: () => void;
		projects?: PickableProject[];
	}
	let { value, onchange, onclose, projects: providedProjects }: Props = $props();

	const fallback: PickableProject[] = (Object.keys(TRACKR_PROJECTS) as ProjectId[]).map((id) => ({
		key: id,
		name: TRACKR_PROJECTS[id].name,
		color: TRACKR_PROJECTS[id].color
	}));
	const projects = $derived(providedProjects ?? fallback);
</script>

<div
	use:clickOutside={onclose}
	use:autoPlace
	in:fly={POPOVER_IN}
	class="absolute top-full mt-1.5 z-50 bg-bg-elev border border-border rounded-[10px] p-1.5 min-w-[220px]"
	style:box-shadow="var(--shadow-lg)"
>
	{#each projects as p (p.key)}
		<button
			type="button"
			onclick={() => { onchange(p.key as ProjectId); onclose(); }}
			class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text"
		>
			<span class="w-2 h-2 rounded-full shrink-0" style:background={p.color}></span>
			<span class="text-[13px]">{p.name}</span>
			<span class="ml-auto text-accent {value === p.key ? 'opacity-100' : 'opacity-0'}">
				<Icon name="check" size={13} />
			</span>
		</button>
	{/each}
</div>
