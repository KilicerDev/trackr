<script lang="ts">
	import { clickOutside } from '$lib/actions/clickOutside';
	import { autoPlace } from '$lib/actions/autoPlace';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/config/motion';
	import Icon from '../Icon.svelte';
	import { TRACKR_LABELS } from '$lib/config/taxonomy';
	import { labelMeta, normalizeTag } from '$lib/utils/label-meta';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		value: string[];
		onchange: (v: string[]) => void;
		onclose: () => void;
		// Tags already in use elsewhere (e.g. on other tasks), offered as
		// quick picks alongside the predefined labels.
		suggestions?: string[];
	}
	let { value, onchange, onclose, suggestions = [] }: Props = $props();

	let entry = $state('');

	// Predefined labels + any tag already selected + tags seen elsewhere.
	// Deduped, predefined first.
	const allOptions = $derived.by(() => {
		const seen = new Set<string>();
		const out: string[] = [];
		for (const id of [...Object.keys(TRACKR_LABELS), ...value, ...suggestions]) {
			if (!seen.has(id)) {
				seen.add(id);
				out.push(id);
			}
		}
		return out;
	});

	const normalizedEntry = $derived(normalizeTag(entry));
	const filtered = $derived(
		normalizedEntry ? allOptions.filter((id) => id.includes(normalizedEntry)) : allOptions
	);
	// Offer a "create" row when the typed tag isn't already an option.
	const canCreate = $derived(normalizedEntry.length > 0 && !allOptions.includes(normalizedEntry));

	function toggle(id: string) {
		const has = value.includes(id);
		onchange(has ? value.filter((x) => x !== id) : [...value, id]);
	}

	function create() {
		if (!canCreate) return;
		onchange([...value, normalizedEntry]);
		entry = '';
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			if (canCreate) create();
			else if (filtered.length === 1) toggle(filtered[0]);
		}
	}
</script>

<div
	use:clickOutside={onclose}
	use:autoPlace
	in:fly={POPOVER_IN}
	class="absolute top-full z-50 mt-1.5 min-w-[210px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
>
	<input
		type="text"
		bind:value={entry}
		{onkeydown}
		placeholder={m.tasks_add_or_search_tags()}
		class="mb-1.5 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-[12.5px] text-text outline-none placeholder:text-text-3 focus:border-border-strong"
	/>
	<div class="max-h-[240px] overflow-y-auto">
		{#each filtered as id (id)}
			{@const l = labelMeta(id)}
			<button
				type="button"
				onclick={() => toggle(id)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<span class="h-2 w-2 rounded-full" style:background={l.color}></span>
				<span class="truncate text-[13px]">{l.label}</span>
				<span class="ml-auto text-accent {value.includes(id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={13} />
				</span>
			</button>
		{/each}
		{#if canCreate}
			<button
				type="button"
				onclick={create}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<Icon name="plus" size={13} class="text-text-3" />
				<span class="truncate text-[13px]">{m.tasks_create_tag({ tag: normalizedEntry })}</span>
			</button>
		{:else if filtered.length === 0}
			<div class="px-2 py-1.5 text-[12.5px] text-text-3">{m.tasks_no_tags()}</div>
		{/if}
	</div>
</div>
