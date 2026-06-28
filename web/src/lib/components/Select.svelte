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
		class="flex h-9 w-full items-center justify-between gap-2 rounded-lg border bg-surface px-3 text-[14px] text-text transition-colors {open
			? 'border-border-strong ring-2 ring-accent/30'
			: 'border-border hover:border-border-strong'}"
	>
		<span class="truncate">{selected?.label ?? ''}</span>
		<Icon name="chevron" size={13} class="shrink-0 text-text-3" />
	</button>
	<Popover {open} onclose={() => (open = false)} minWidth={maxWidth}>
		<div role="listbox" aria-label={ariaLabel}>
			{#each options as o (o.value)}
				<button
					type="button"
					role="option"
					aria-selected={o.value === value}
					onclick={() => pick(o.value)}
					class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 transition-colors hover:bg-surface-2 hover:text-text"
				>
					<span class="text-[14px]">{o.label}</span>
					<span class="ml-auto text-accent {o.value === value ? 'opacity-100' : 'opacity-0'}">
						<Icon name="check" size={14} />
					</span>
				</button>
			{/each}
		</div>
	</Popover>
</div>
