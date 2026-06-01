<script lang="ts">
	import { clickOutside } from '$lib/actions/clickOutside';
	import { autoPlace } from '$lib/actions/autoPlace';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/motion';
	import TypeBadge from '../TypeBadge.svelte';
	import Icon from '../Icon.svelte';
	import { TRACKR_TYPES } from '$lib/data';
	import type { TypeId } from '$lib/types';

	interface Props {
		value: TypeId;
		onchange: (t: TypeId) => void;
		onclose: () => void;
	}
	let { value, onchange, onclose }: Props = $props();
</script>

<div
	use:clickOutside={onclose}
	use:autoPlace
	in:fly={POPOVER_IN}
	class="absolute top-full mt-1.5 z-50 bg-bg-elev border border-border rounded-[10px] p-1.5 min-w-[180px]"
	style:box-shadow="var(--shadow-lg)"
>
	{#each TRACKR_TYPES as t (t.id)}
		<button
			type="button"
			onclick={() => { onchange(t.id); onclose(); }}
			class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text"
		>
			<TypeBadge type={t.id} showLabel={false} />
			<span class="text-[13px]">{t.label}</span>
			<span class="ml-auto text-accent {value === t.id ? 'opacity-100' : 'opacity-0'}">
				<Icon name="check" size={13} />
			</span>
		</button>
	{/each}
</div>
