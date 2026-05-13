<script lang="ts">
	let { children } = $props();
</script>

<div class="min-h-screen bg-bg text-text">
	{@render children()}
</div>
