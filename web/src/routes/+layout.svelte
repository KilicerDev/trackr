<script lang="ts">
	import '../app.css';
	import ConfirmHost from '$lib/components/ConfirmHost.svelte';
	let { children } = $props();
</script>

{@render children()}
<ConfirmHost />
