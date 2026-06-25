<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import Button from './Button.svelte';
	import { dialogs, _dismiss } from './confirm.svelte';

	const top = $derived(dialogs.list[dialogs.list.length - 1]);

	function onConfirm() {
		if (top) _dismiss(top.id, true);
	}
	function onCancel() {
		if (top) _dismiss(top.id, false);
	}

	function onKey(e: KeyboardEvent) {
		if (!top) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			onCancel();
		} else if (e.key === 'Enter') {
			e.preventDefault();
			onConfirm();
		}
	}

	const toneStyles = {
		default: {
			ring: 'rgba(239,122,109,0.18)',
			accent: 'var(--accent)',
			glyph: 'check'
		},
		danger: {
			ring: 'rgba(239,79,94,0.22)',
			accent: '#ef4f5e',
			glyph: 'danger'
		},
		warn: {
			ring: 'rgba(240,168,92,0.22)',
			accent: '#f0a85c',
			glyph: 'warn'
		}
	} as const;
</script>

<svelte:window onkeydown={onKey} />

{#if top}
	{@const t = toneStyles[top.tone]}
	<button
		type="button"
		aria-label="Dismiss dialog"
		onclick={onCancel}
		transition:fade={{ duration: 160 }}
		class="fixed inset-0 z-[60] bg-black/60 backdrop-blur-[3px]"
	></button>
	<div class="pointer-events-none fixed inset-0 z-[61] grid place-items-center p-4">
		<div
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="confirm-title"
			transition:fly={{ y: 10, duration: 200, easing: cubicOut }}
			class="pointer-events-auto w-full max-w-[420px] overflow-hidden rounded-2xl border border-border bg-bg-elev"
			style:box-shadow="var(--shadow-lg), 0 0 0 1px rgba(255,255,255,0.02) inset"
		>
			<div class="flex gap-3.5 px-5 pt-5 pb-4">
				<span
					class="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
					style:background={t.ring}
					style:color={t.accent}
				>
					{#if t.glyph === 'danger'}
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.8"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M3 6h18" />
							<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
							<path d="M19 6l-1.2 13.1A2 2 0 0 1 15.8 21H8.2a2 2 0 0 1-2-1.9L5 6" />
							<path d="M10 11v6M14 11v6" />
						</svg>
					{:else if t.glyph === 'warn'}
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.8"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path
								d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
							/>
							<path d="M12 9v4M12 17h.01" />
						</svg>
					{:else}
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.8"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<circle cx="12" cy="12" r="9" />
							<path d="M12 8v5M12 16h.01" />
						</svg>
					{/if}
				</span>
				<div class="min-w-0 flex-1 pt-0.5">
					<div id="confirm-title" class="text-[14px] font-semibold tracking-[-0.01em] text-text">
						{top.title}
					</div>
					{#if top.message}
						<div class="mt-1.5 text-[13px] leading-relaxed whitespace-pre-line text-text-3">
							{top.message}
						</div>
					{/if}
				</div>
			</div>
			<div class="flex items-center justify-end gap-2 border-t border-border/80 bg-bg/40 px-5 py-3">
				{#if top.kind === 'confirm'}
					<Button variant="default" onclick={onCancel}>{top.cancelLabel ?? 'Cancel'}</Button>
				{/if}
				{#if top.tone === 'danger'}
					<button
						type="button"
						onclick={onConfirm}
						class="inline-flex items-center gap-1.5 rounded-lg border border-transparent px-[11px] py-[7px] text-[13px] font-medium text-white transition-[background,border-color,transform] duration-150 hover:brightness-110 active:translate-y-[1px] bg-prio-urgent"
						style:box-shadow="var(--shadow-edge), 0 4px 12px rgba(239,79,94,0.28)"
					>
						{top.confirmLabel}
					</button>
				{:else if top.tone === 'warn'}
					<button
						type="button"
						onclick={onConfirm}
						class="inline-flex items-center gap-1.5 rounded-lg border border-transparent px-[11px] py-[7px] text-[13px] font-medium text-white transition-[background,border-color,transform] duration-150 hover:brightness-110 active:translate-y-[1px] bg-prio-medium"
						style:box-shadow="var(--shadow-edge), 0 4px 12px rgba(240,168,92,0.28)"
					>
						{top.confirmLabel}
					</button>
				{:else}
					<Button variant="primary" onclick={onConfirm}>{top.confirmLabel}</Button>
				{/if}
			</div>
		</div>
	</div>
{/if}
