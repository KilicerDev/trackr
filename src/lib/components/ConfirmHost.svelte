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
	<div class="fixed inset-0 z-[61] grid place-items-center p-4 pointer-events-none">
		<div
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="confirm-title"
			transition:fly={{ y: 10, duration: 200, easing: cubicOut }}
			class="bg-bg-elev border border-border rounded-2xl pointer-events-auto w-full max-w-[420px] overflow-hidden"
			style:box-shadow="var(--shadow-lg), 0 0 0 1px rgba(255,255,255,0.02) inset"
		>
			<div class="px-5 pt-5 pb-4 flex gap-3.5">
				<span
					class="shrink-0 w-9 h-9 grid place-items-center rounded-xl"
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
							<path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
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
					<div id="confirm-title" class="text-[15px] font-semibold tracking-[-0.01em] text-text">
						{top.title}
					</div>
					{#if top.message}
						<div class="text-[12.5px] text-text-3 mt-1.5 leading-relaxed whitespace-pre-line">
							{top.message}
						</div>
					{/if}
				</div>
			</div>
			<div
				class="flex items-center justify-end gap-2 px-5 py-3 border-t border-border/80 bg-bg/40"
			>
				{#if top.kind === 'confirm'}
					<Button variant="default" onclick={onCancel}>{top.cancelLabel ?? 'Cancel'}</Button>
				{/if}
				{#if top.tone === 'danger'}
					<button
						type="button"
						onclick={onConfirm}
						class="inline-flex items-center gap-1.5 rounded-lg font-medium text-[13px] transition-[background,border-color,transform] duration-150 hover:brightness-110 active:translate-y-[1px] px-[11px] py-[7px] text-white border border-transparent"
						style:background="#ef4f5e"
						style:box-shadow="0 1px 0 rgba(255,255,255,0.18) inset, 0 4px 12px rgba(239,79,94,0.28)"
					>
						{top.confirmLabel}
					</button>
				{:else if top.tone === 'warn'}
					<button
						type="button"
						onclick={onConfirm}
						class="inline-flex items-center gap-1.5 rounded-lg font-medium text-[13px] transition-[background,border-color,transform] duration-150 hover:brightness-110 active:translate-y-[1px] px-[11px] py-[7px] text-white border border-transparent"
						style:background="#f0a85c"
						style:box-shadow="0 1px 0 rgba(255,255,255,0.18) inset, 0 4px 12px rgba(240,168,92,0.28)"
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
