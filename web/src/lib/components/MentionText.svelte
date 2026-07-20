<script lang="ts">
	import { segmentMentions } from '$lib/utils/mentions';
	import { resolveUser } from '$lib/stores/lookup.svelte';

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
<span class="[overflow-wrap:anywhere] {cls}"
	>{#each segments as seg, i (i)}{#if seg.type === 'mention'}<span
				class="-mx-0.5 inline-flex items-center rounded bg-accent/10 px-1 align-baseline font-medium text-accent"
				>@{resolveUser(seg.id)?.name ?? seg.name}</span
			>{:else}{seg.value}{/if}{/each}</span
>
