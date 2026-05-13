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
	class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-surface-2 text-text-2 hover:text-text transition-colors"
>
	{@render children()}
	<span class="ml-auto text-accent {selected ? 'opacity-100' : 'opacity-0'}">
		<Icon name="check" size={13} />
	</span>
</button>
