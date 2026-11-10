<script lang="ts">
	// Collaboration sync pill shared by the wiki and notes editors: a dot that
	// pulses while connected, amber while connecting, muted when offline.
	interface Props {
		state: string;
		label: string;
		title?: string;
	}
	let { state, label, title }: Props = $props();
</script>

<span class="sync-status" data-state={state} {title}>
	<span class="sync-status__dot"></span>
	{label}
</span>

<style>
	.sync-status {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		height: 28px;
		padding: 0 10px;
		border-radius: 8px;
		background: color-mix(in oklab, currentColor 9%, transparent);
		font-size: 13px;
		font-weight: 500;
		letter-spacing: 0.01em;
		color: var(--text-3);
		white-space: nowrap;
		user-select: none;
	}
	.sync-status__dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--text-4);
	}
	.sync-status[data-state='connected'] {
		color: var(--color-status-done, #7fc8a9);
	}
	.sync-status[data-state='connected'] .sync-status__dot {
		background: var(--color-status-done, #7fc8a9);
		box-shadow: 0 0 0 0 rgba(127, 200, 169, 0.5);
		animation: sync-pulse 2.2s ease-out infinite;
	}
	.sync-status[data-state='connecting'] {
		color: var(--color-status-paused, #e9c46a);
	}
	.sync-status[data-state='connecting'] .sync-status__dot {
		background: var(--color-status-paused, #e9c46a);
	}
	@keyframes sync-pulse {
		0% {
			box-shadow: 0 0 0 0 rgba(127, 200, 169, 0.45);
		}
		70% {
			box-shadow: 0 0 0 6px rgba(127, 200, 169, 0);
		}
		100% {
			box-shadow: 0 0 0 0 rgba(127, 200, 169, 0);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.sync-status[data-state='connected'] .sync-status__dot {
			animation: none;
		}
	}
</style>
