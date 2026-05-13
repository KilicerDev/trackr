<script lang="ts">
	import { clickOutside } from '$lib/actions/clickOutside';
	import { autoPlace } from '$lib/actions/autoPlace';
	import Icon from '../Icon.svelte';
	import { TRACKR_LABELS } from '$lib/data';

	interface Props {
		value: string[];
		onchange: (v: string[]) => void;
		onclose: () => void;
	}
	let { value, onchange, onclose }: Props = $props();

	function toggle(id: string) {
		const has = value.includes(id);
		onchange(has ? value.filter((x) => x !== id) : [...value, id]);
	}
</script>

<div
	use:clickOutside={onclose}
	use:autoPlace
	class="absolute top-full mt-1.5 z-50 bg-bg-elev border border-border rounded-[10px] p-1.5 min-w-[180px]"
	style:box-shadow="var(--shadow-lg)"
>
	{#each Object.keys(TRACKR_LABELS) as id (id)}
		{@const l = TRACKR_LABELS[id]}
		<button
			type="button"
			onclick={() => toggle(id)}
			class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text"
		>
			<span class="w-2 h-2 rounded-full" style:background={l.color}></span>
			<span class="text-[13px]">{l.label}</span>
			<span class="ml-auto text-accent {value.includes(id) ? 'opacity-100' : 'opacity-0'}">
				<Icon name="check" size={13} />
			</span>
		</button>
	{/each}
</div>
