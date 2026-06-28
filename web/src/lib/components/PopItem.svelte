<script lang="ts">
	import Icon from './Icon.svelte';
	import type { Snippet } from 'svelte';
	interface Props {
		selected?: boolean;
		onclick?: (e: MouseEvent) => void;
		children: Snippet;
	}
	let { selected = false, onclick, children }: Props = $props();
</script>

<button
	type="button"
	{onclick}
	class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-text-2 transition-colors hover:bg-surface-2 hover:text-text"
>
	{@render children()}
	<span class="ml-auto text-accent {selected ? 'opacity-100' : 'opacity-0'}">
		<Icon name="check" size={14} />
	</span>
</button>
