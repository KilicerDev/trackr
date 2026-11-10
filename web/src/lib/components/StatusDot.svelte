<script lang="ts">
	// Task status marker: one lucide circle icon per status, in the status
	// colour (no hand-drawn shapes).
	//   backlog → circle-dashed     todo → circle
	//   in progress → contrast      paused → circle-pause
	//   in review → circle-dot      done → circle-check
	//   cancelled → circle-x
	// Every one of them draws its ring as r=10 in a 24 box, so they share one
	// scaling: the ring's outer edge is exactly `size` and its stroke 1.5px,
	// whatever the size.
	import type { Component } from 'svelte';
	import type { StatusId } from '$lib/types';
	import { TRACKR_STATUSES } from '$lib/config/taxonomy';
	import { statusLabel } from '$lib/utils/labels';
	import {
		Circle,
		CircleCheck,
		CircleDashed,
		CircleDot,
		CirclePause,
		CircleX,
		Contrast
	} from '@lucide/svelte';

	interface Props {
		status: StatusId;
		size?: number;
	}
	let { status, size = 15 }: Props = $props();
	let meta = $derived(TRACKR_STATUSES.find((s) => s.id === status)!);

	const ICONS: Record<StatusId, Component<Record<string, unknown>>> = {
		backlog: CircleDashed,
		todo: Circle,
		in_progress: Contrast,
		paused: CirclePause,
		in_review: CircleDot,
		done: CircleCheck,
		cancelled: CircleX
	} as Record<StatusId, Component<Record<string, unknown>>>;
	let Icon = $derived(ICONS[status] ?? Circle);

	// Outer edge of an r=10 ring with stroke w (viewBox units) rendered at box
	// B px: (20 + w) * B / 24. Solving for edge = size and stroke = 1.5px gives:
	let box = $derived(1.2 * (size - 1.5));
	let stroke = $derived(30 / (size - 1.5));
</script>

<span
	class="relative inline-block shrink-0"
	style:width="{size}px"
	style:height="{size}px"
	aria-label={statusLabel(status)}
	title={statusLabel(status)}
>
	<span
		class="absolute grid place-items-center"
		style:color={meta?.dot}
		style:left="{(size - box) / 2}px"
		style:top="{(size - box) / 2}px"
	>
		<Icon size={box} strokeWidth={stroke} aria-hidden="true" />
	</span>
</span>
