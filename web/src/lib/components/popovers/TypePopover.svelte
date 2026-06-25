<script lang="ts">
	import { clickOutside } from '$lib/actions/clickOutside';
	import { autoPlace } from '$lib/actions/autoPlace';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/config/motion';
	import TypeBadge from '../TypeBadge.svelte';
	import Icon from '../Icon.svelte';
	import { TRACKR_TYPES } from '$lib/config/taxonomy';
	import type { TypeId } from '$lib/types';
	import { typeLabel } from '$lib/utils/labels';

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
	class="absolute top-full z-50 mt-1.5 min-w-[180px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
>
	{#each TRACKR_TYPES as t (t.id)}
		<button
			type="button"
			onclick={() => {
				onchange(t.id);
				onclose();
			}}
			class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
		>
			<TypeBadge type={t.id} showLabel={false} />
			<span class="text-[13px]">{typeLabel(t.id)}</span>
			<span class="ml-auto text-accent {value === t.id ? 'opacity-100' : 'opacity-0'}">
				<Icon name="check" size={13} />
			</span>
		</button>
	{/each}
</div>
