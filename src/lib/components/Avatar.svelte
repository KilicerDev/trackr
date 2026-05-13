<script lang="ts">
	type AvatarUser = { name: string; initials: string; color: string };
	interface Props {
		user: AvatarUser | undefined;
		size?: number;
		ring?: boolean;
		class?: string;
	}
	let { user, size = 22, ring = false, class: cls = '' }: Props = $props();
</script>

{#if user}
	<span
		class="inline-grid place-items-center rounded-full text-[10px] font-semibold text-white shrink-0 select-none {cls}"
		style:width="{size}px"
		style:height="{size}px"
		style:background={user.color}
		style:font-size="{Math.max(9, Math.round(size * 0.4))}px"
		style:box-shadow={ring ? '0 0 0 2px var(--bg-elev)' : 'none'}
		title={user.name}
	>
		{user.initials}
	</span>
{:else}
	<span
		class="inline-grid place-items-center rounded-full bg-surface-2 text-text-3 text-[10px] {cls}"
		style:width="{size}px"
		style:height="{size}px">?</span
	>
{/if}
