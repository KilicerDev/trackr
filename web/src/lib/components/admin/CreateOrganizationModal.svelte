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
		<div class="flex items-center border-b border-border px-5 pt-4 pb-3">
			<div>
				<div class="text-[11px] tracking-[0.08em] text-text-4 uppercase">{m.admin_workspace()}</div>
				<div class="text-[15px] font-semibold">{m.admin_org_new()}</div>
			</div>
			<button
				type="button"
				onclick={onclose}
				aria-label={m.common_close()}
				class="ml-auto grid h-8 w-8 place-items-center rounded-lg text-text-3 transition-colors hover:bg-surface hover:text-text"
			>
				<Icon name="x" size={14} />
			</button>
		</div>

		<div class="px-5 pt-5 pb-3">
			<div class="mb-4 flex items-start gap-3.5">
				<span
					class="relative grid shrink-0 place-items-center font-semibold text-white transition-[background] duration-200"
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
						class="block w-full border-0 bg-transparent text-[19px] font-semibold tracking-[-0.01em] text-text outline-none placeholder:text-text-3"
					/>
					<div class="mt-1 flex items-center gap-1.5">
						<span class="text-[10.5px] tracking-[0.08em] text-text-4 uppercase"
							>{m.admin_slug()}</span
						>
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
							class="w-[160px] rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-[11.5px] tracking-[0.02em] text-text outline-none focus:border-border-strong"
						/>
					</div>
				</div>
			</div>

			<textarea
				name="description"
				bind:value={description}
				placeholder={m.admin_org_description_placeholder()}
				rows="2"
				class="mb-4 w-full resize-none border-0 bg-transparent text-[13.5px] leading-relaxed text-text-2 outline-none placeholder:text-text-3"
			></textarea>

			<div>
				<div class="mb-2 text-[10.5px] tracking-[0.08em] text-text-4 uppercase">
					{m.admin_color()}
				</div>
				<div class="flex flex-wrap gap-1.5">
					{#each PALETTE as c (c)}
						<button
							type="button"
							onclick={() => (color = c)}
							aria-label={m.admin_pick_color({ color: c })}
							class="relative grid h-7 w-7 place-items-center rounded-lg transition-transform hover:scale-105 active:scale-95"
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
					class="mt-4 rounded-lg border px-3 py-2 text-[12.5px] border-prio-urgent/35 bg-prio-urgent/8 text-accent"
				>
					{serverError}
				</div>
			{/if}
		</div>

		<div class="flex items-center gap-2 rounded-b-2xl border-t border-border bg-bg/40 px-5 py-3">
			<span class="text-[11.5px] text-text-3">
				<Kbd>⌘↵</Kbd>
				{m.admin_to_create()}
			</span>
			<div class="ml-auto flex items-center gap-2">
				<Button variant="default" onclick={onclose}>{m.common_cancel()}</Button>
				<button
					type="submit"
					disabled={submitting || !name.trim() || !effectiveSlug}
					class="inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-accent px-[11px] py-[7px] text-[13px] font-medium text-white shadow-btn transition-[background,border-color,transform] duration-150 hover:bg-accent-strong active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50"
				>
					{submitting ? m.common_creating() : m.admin_org_create()}
				</button>
			</div>
		</div>
	</form>
</Modal>
