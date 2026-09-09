<script lang="ts">
	import GuideEditor from '$lib/components/mcp/GuideEditor.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<GuideEditor
	guide={data.guide}
	bodyMax={data.bodyMax}
	backHref="/me/connections"
	backLabel={m.connections_guide_back()}
/>
