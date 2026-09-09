<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import ConfirmHost from '$lib/components/ConfirmHost.svelte';
	import { parkHandoff } from '$lib/instances-handoff';
	let { children } = $props();

	// A switch link from another trackr instance carries `#from=<origin>`. Park
	// it before any login redirect drops it; the signed-in shell asks the user
	// whether to add that instance (see InstanceSwitcher).
	onMount(parkHandoff);
</script>

{@render children()}
<ConfirmHost />
