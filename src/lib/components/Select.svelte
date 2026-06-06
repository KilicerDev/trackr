<script lang="ts">
	import Icon from './Icon.svelte';
	import Popover from './Popover.svelte';

	interface Option {
		value: string;
		label: string;
	}
	interface Props {
		value: string;
		options: Option[];
		onchange?: (value: string) => void;
		ariaLabel?: string;
		maxWidth?: number;
	}
	let { value = $bindable(), options, onchange, ariaLabel, maxWidth = 260 }: Props = $props();

	let open = $state(false);
	const selected = $derived(options.find((o) => o.value === value));

	function pick(v: string) {
		value = v;
		onchange?.(v);
		open = false;
	}
</script>

<div class="relative w-full" style:max-width="{maxWidth}px">
	<button
		type="button"
		aria-label={ariaLabel}
		aria-haspopup="listbox"
		aria-expanded={open}
		onclick={() => (open = !open)}
		class="flex items-center justify-between gap-2 w-full h-9 bg-surface border rounded-lg px-3 text-[13px] text-text transition-colors {open
			? 'border-border-strong ring-2 ring-accent/30'
			: 'border-border hover:border-border-strong'}"
	>
		<span class="truncate">{selected?.label ?? ''}</span>
		<Icon name="chevron" size={12} class="text-text-3 shrink-0" />
	</button>
	<Popover {open} onclose={() => (open = false)} minWidth={maxWidth}>
		<div role="listbox" aria-label={ariaLabel}>
			{#each options as o (o.value)}
				<button
					type="button"
					role="option"
					aria-selected={o.value === value}
					onclick={() => pick(o.value)}
					class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text transition-colors"
				>
					<span class="text-[13px]">{o.label}</span>
					<span class="ml-auto text-accent {o.value === value ? 'opacity-100' : 'opacity-0'}">
						<Icon name="check" size={13} />
					</span>
				</button>
			{/each}
		</div>
	</Popover>
</div>
