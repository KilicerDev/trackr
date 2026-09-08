<script lang="ts">
	// The instance mark: the uploaded logo when an admin set one, else the
	// built-in three coral bars. Square box of `size` px; rasters are
	// letterboxed inside it so wide logos still fit the sidebar rail.
	import { brandLogoUrl, brandName } from '$lib/brand';

	let { size = 22, class: cls = '' }: { size?: number; class?: string } = $props();
	const logo = $derived(brandLogoUrl());
</script>

{#if logo}
	<img
		src={logo}
		alt={brandName()}
		width={size}
		height={size}
		class="object-contain {cls}"
		style:width="{size}px"
		style:height="{size}px"
		draggable="false"
	/>
{:else}
	<svg
		width={size}
		height={size}
		viewBox="0 0 16 16"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
		class={cls}
		aria-hidden="true"
	>
		<rect x="1.26971" y="1.2627" width="3.65721" height="13.4566" rx="1" fill="#FF4867" />
		<rect x="6.146" y="1.2627" width="3.65721" height="13.4566" rx="1" fill="#FF4867" />
		<rect x="11.0223" y="1.2627" width="3.65721" height="13.4566" rx="1" fill="#FF4867" />
	</svg>
{/if}
