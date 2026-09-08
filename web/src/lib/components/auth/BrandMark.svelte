<script lang="ts">
	import BrandLogo from '$lib/components/BrandLogo.svelte';
	import { brandName } from '$lib/brand';
</script>

<div
	class="mb-7 flex items-center justify-center gap-2.5 text-[15px] font-semibold tracking-[-0.01em]"
>
	<span class="grid place-items-center" aria-hidden="true">
		<BrandLogo size={22} />
	</span>
	<span class="text-text">{brandName()}</span>
</div>
