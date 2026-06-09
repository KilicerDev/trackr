<script lang="ts">
	import { segmentMentions } from '$lib/mentions';
	import { resolveUser } from '$lib/lookup.svelte';

	interface Props {
		text: string | null | undefined;
		class?: string;
	}
	let { text, class: cls = '' }: Props = $props();

	const segments = $derived(segmentMentions(text ?? ''));
</script>

<!-- Inline renderer: text segments inherit the parent's whitespace handling
	 (e.g. whitespace-pre-wrap); mentions render as accent pills. The stored
	 display name is the fallback when the id no longer resolves. -->
<span class={cls}
	>{#each segments as seg, i (i)}{#if seg.type === 'mention'}<span
				class="inline-flex items-center rounded px-1 -mx-0.5 font-medium text-accent bg-accent/10 align-baseline"
				>@{resolveUser(seg.id)?.name ?? seg.name}</span
			>{:else}{seg.value}{/if}{/each}</span
>
