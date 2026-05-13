<script lang="ts">
	import type { ProjectId } from '$lib/types';
	import { TRACKR_PROJECTS } from '$lib/data';
	interface Props {
		id: ProjectId;
		size?: number;
		radius?: number;
	}
	let { id, size = 24, radius = 7 }: Props = $props();
	let p = $derived(TRACKR_PROJECTS[id]);
</script>

<span
	class="inline-grid place-items-center text-white font-semibold shrink-0 relative"
	style:width="{size}px"
	style:height="{size}px"
	style:border-radius="{radius}px"
	style:background="linear-gradient(140deg, {p.color}, color-mix(in oklch, {p.color} 70%, #000) 85%)"
	style:font-size="{Math.round(size * 0.5)}px"
	style:box-shadow="0 1px 0 rgba(255,255,255,0.16) inset"
	title={p.name}
>
	{p.icon}
</span>
