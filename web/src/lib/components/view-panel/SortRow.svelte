<script lang="ts" generics="K extends string">
	// "Sort by" row: direction toggle just left of the key dropdown. Picking a
	// new key resets the direction to that key's natural one (due dates
	// ascend, priorities descend) so the first click does the expected thing.
	import Icon from '../Icon.svelte';
	import SelectRow from './SelectRow.svelte';
	import { NATURAL_DIR, type SortSpec, type SortDir } from '$lib/utils/sort';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		options: { id: K; label: string }[];
		value: SortSpec<K>;
		onchange: (s: SortSpec<K>) => void;
	}
	let { options, value, onchange }: Props = $props();

	const natural = (k: K): SortDir => (NATURAL_DIR as Record<string, SortDir>)[k] ?? 'asc';
	const dirLabel = $derived(value.dir === 'asc' ? m.view_sort_asc() : m.view_sort_desc());
</script>

<SelectRow
	label={m.view_sort_by()}
	{options}
	value={value.by}
	onchange={(by) => onchange({ by, dir: natural(by) })}
>
	{#snippet leading()}
		<button
			type="button"
			onclick={() => onchange({ by: value.by, dir: value.dir === 'asc' ? 'desc' : 'asc' })}
			aria-label={dirLabel}
			title={dirLabel}
			class="grid h-7 w-7 place-items-center rounded-md border border-border bg-bg-elev text-text-2 transition-colors hover:bg-surface-2 hover:text-text focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none"
		>
			<Icon
				name="arrow-up"
				size={13}
				class="transition-transform duration-200 {value.dir === 'desc' ? 'rotate-180' : ''}"
			/>
		</button>
	{/snippet}
</SelectRow>
