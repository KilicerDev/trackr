<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { ActionResult } from '@sveltejs/kit';
	import Modal from '../Modal.svelte';
	import Icon from '../Icon.svelte';
	import Button from '../Button.svelte';
	import Kbd from '../Kbd.svelte';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		open: boolean;
		onclose: () => void;
		oncreated?: (name: string) => void;
		onerror?: (msg: string) => void;
	}
	let { open, onclose, oncreated, onerror }: Props = $props();

	const PALETTE = [
		'#ef7a6d',
		'#e07a5f',
		'#f0a85c',
		'#e9c46a',
		'#7fc8a9',
		'#5fb3c2',
		'#7a9cf0',
		'#9b8cf0',
		'#c08bd6',
		'#d97cae'
	];

	let name = $state('');
	let slug = $state('');
	let slugTouched = $state(false);
	let description = $state('');
	let color = $state(PALETTE[6]); // periwinkle is a nice "neutral" default
	let submitting = $state(false);
	let serverError = $state<string | null>(null);
	let formEl = $state<HTMLFormElement>();

	function deriveSlug(n: string): string {
		return n
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[̀-ͯ]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 48);
	}
	const autoSlug = $derived(deriveSlug(name));
	const effectiveSlug = $derived(slugTouched ? slug : autoSlug);

	$effect(() => {
		if (open) {
			name = '';
			slug = '';
			slugTouched = false;
			description = '';
			color = PALETTE[6];
			submitting = false;
			serverError = null;
		}
	});

	function onKey(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') onclose();
		else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			formEl?.requestSubmit();
		}
	}

	const initials = $derived(
		name
			.trim()
			.split(/\s+/)
			.map((p) => p[0])
			.filter(Boolean)
			.slice(0, 2)
			.join('')
			.toUpperCase() || '·'
	);
</script>

<svelte:window onkeydown={onKey} />

<Modal {open} {onclose} maxWidth={520}>
	<form
		bind:this={formEl}
		method="POST"
		action="/admin/organizations?/create"
		use:enhance={() => {
			submitting = true;
			serverError = null;
			return async ({ result }: { result: ActionResult }) => {
				submitting = false;
				if (result.type === 'success') {
					oncreated?.(name.trim());
					await invalidateAll();
					onclose();
				} else if (result.type === 'failure') {
					const msg =
						(result.data as { message?: string } | undefined)?.message ??
						m.admin_org_create_failed();
					serverError = msg;
					onerror?.(msg);
				} else if (result.type === 'error') {
					const msg = result.error?.message ?? m.admin_org_create_failed();
					serverError = msg;
					onerror?.(msg);
				}
			};
		}}
	>
		<div class="flex items-center px-5 pt-4 pb-3 border-b border-border">
			<div>
				<div class="text-[11px] uppercase tracking-[0.08em] text-text-4">{m.admin_workspace()}</div>
				<div class="text-[15px] font-semibold">{m.admin_org_new()}</div>
			</div>
			<button
				type="button"
				onclick={onclose}
				aria-label={m.common_close()}
				class="ml-auto w-8 h-8 grid place-items-center rounded-lg text-text-3 hover:text-text hover:bg-surface transition-colors"
			>
				<Icon name="x" size={14} />
			</button>
		</div>

		<div class="px-5 pt-5 pb-3">
			<div class="flex items-start gap-3.5 mb-4">
				<span
					class="shrink-0 grid place-items-center text-white font-semibold relative transition-[background] duration-200"
					style:width="48px"
					style:height="48px"
					style:border-radius="13px"
					style:font-size="18px"
					style:background="linear-gradient(140deg, {color}, color-mix(in oklch, {color} 70%, #000) 85%)"
					style:box-shadow="0 1px 0 rgba(255,255,255,0.18) inset, 0 6px 18px {color}33"
				>
					{initials}
				</span>
				<div class="min-w-0 flex-1">
					<input
						type="text"
						name="name"
						bind:value={name}
						required
						placeholder={m.admin_org_name_placeholder()}
						class="block w-full bg-transparent border-0 outline-none text-[19px] font-semibold tracking-[-0.01em] text-text placeholder:text-text-3"
					/>
					<div class="flex items-center gap-1.5 mt-1">
						<span class="text-[10.5px] uppercase tracking-[0.08em] text-text-4">{m.admin_slug()}</span>
						<input
							type="text"
							name="slug"
							value={effectiveSlug}
							oninput={(e) => {
								slugTouched = true;
								slug = (e.target as HTMLInputElement).value
									.toLowerCase()
									.replace(/[^a-z0-9-]/g, '')
									.slice(0, 48);
							}}
							maxlength={48}
							placeholder="acme-co"
							class="bg-surface border border-border rounded-md px-1.5 py-0.5 font-mono text-[11.5px] text-text outline-none focus:border-border-strong w-[160px] tracking-[0.02em]"
						/>
					</div>
				</div>
			</div>

			<textarea
				name="description"
				bind:value={description}
				placeholder={m.admin_org_description_placeholder()}
				rows="2"
				class="w-full resize-none bg-transparent border-0 outline-none text-[13.5px] leading-relaxed text-text-2 placeholder:text-text-3 mb-4"
			></textarea>

			<div>
				<div class="text-[10.5px] uppercase tracking-[0.08em] text-text-4 mb-2">{m.admin_color()}</div>
				<div class="flex flex-wrap gap-1.5">
					{#each PALETTE as c (c)}
						<button
							type="button"
							onclick={() => (color = c)}
							aria-label={m.admin_pick_color({ color: c })}
							class="relative w-7 h-7 rounded-lg grid place-items-center transition-transform hover:scale-105 active:scale-95"
							style:background="linear-gradient(140deg, {c}, color-mix(in oklch, {c} 70%, #000) 85%)"
							style:box-shadow={color === c
								? `0 0 0 2px var(--bg-elev), 0 0 0 4px ${c}`
								: '0 1px 0 rgba(255,255,255,0.18) inset'}
						>
							{#if color === c}
								<svg
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill="none"
									stroke="white"
									stroke-width="3"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<polyline points="20 6 9 17 4 12"></polyline>
								</svg>
							{/if}
						</button>
					{/each}
				</div>
			</div>

			<input type="hidden" name="color" value={color} />

			{#if serverError}
				<div
					class="rounded-lg border px-3 py-2 text-[12.5px] mt-4"
					style:border-color="rgba(239,79,94,0.35)"
					style:background="rgba(239,79,94,0.08)"
					style:color="#ef7a6d"
				>
					{serverError}
				</div>
			{/if}
		</div>

		<div class="flex items-center gap-2 px-5 py-3 border-t border-border bg-bg/40 rounded-b-2xl">
			<span class="text-[11.5px] text-text-3">
				<Kbd>⌘↵</Kbd> {m.admin_to_create()}
			</span>
			<div class="ml-auto flex items-center gap-2">
				<Button variant="default" onclick={onclose}>{m.common_cancel()}</Button>
				<button
					type="submit"
					disabled={submitting || !name.trim() || !effectiveSlug}
					class="inline-flex items-center gap-1.5 rounded-lg font-medium text-[13px] transition-[background,border-color,transform] duration-150 disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-[1px] px-[11px] py-[7px] bg-accent text-white border border-transparent hover:bg-accent-strong shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_4px_12px_rgba(239,122,109,0.25)]"
				>
					{submitting ? m.common_creating() : m.admin_org_create()}
				</button>
			</div>
		</div>
	</form>
</Modal>
