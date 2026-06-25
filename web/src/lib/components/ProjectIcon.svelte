<script lang="ts">
	import { page } from '$app/state';

	interface Props {
		// One of two modes:
		//   1. `color` + `icon` provided directly (preferred for DB-backed callers).
		//   2. `id` + lookup via $page.data.projects (matched on key).
		id?: string;
		color?: string;
		icon?: string;
		size?: number;
		radius?: number;
	}
	let { id, color, icon, size = 24, radius = 7 }: Props = $props();

	const resolved = $derived.by(() => {
		if (color && icon) return { color, icon, name: '' };
		if (id) {
			type DataShape = { projects?: { key: string; color: string; icon: string; name: string }[] };
			const projects = (page.data as DataShape).projects;
			const fromDb = projects?.find((p) => p.key === id);
			if (fromDb) return { color: fromDb.color, icon: fromDb.icon, name: fromDb.name };
		}
		return { color: '#7c7c84', icon: '?', name: '' };
	});
</script>

<span
	class="relative inline-grid shrink-0 place-items-center font-semibold text-white"
	style:width="{size}px"
	style:height="{size}px"
	style:border-radius="{radius}px"
	style:background="linear-gradient(140deg, {resolved.color}, color-mix(in oklch, {resolved.color} 70%,
	#000) 85%)"
	style:font-size="{Math.round(size * 0.5)}px"
	style:box-shadow="0 1px 0 rgba(255,255,255,0.16) inset"
	title={resolved.name}
>
	{resolved.icon}
</span>
