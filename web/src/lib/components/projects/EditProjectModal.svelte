<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { showToast } from '$lib/stores/toast.svelte';
	import type { ActionResult } from '@sveltejs/kit';
	import Modal from '../Modal.svelte';
	import Icon from '../Icon.svelte';
	import Button from '../Button.svelte';
	import Kbd from '../Kbd.svelte';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/config/motion';
	import { PROJECT_STATUS } from '$lib/config/taxonomy';
	import { projectStatusLabel } from '$lib/utils/labels';
	import { m } from '$lib/paraglide/messages';
	import LabelChip from '../LabelChip.svelte';
	import TagsPopover from '../popovers/TagsPopover.svelte';
	import type { Project } from '$lib/types';

	interface Props {
		open: boolean;
		onclose: () => void;
		project: {
			key: string;
			name: string;
			description: string | null;
			color: string;
			status: string;
			tags?: string[];
		};
	}

	let { open, onclose, project }: Props = $props();

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

	const STATUSES: Project['status'][] = [
		'prospect',
		'planned',
		'active',
		'paused',
		'completed',
		'cancelled',
		'archived'
	];

	let name = $state('');
	let description = $state('');
	let color = $state(PALETTE[0]);
	let status = $state<Project['status']>('active');
	let tags = $state<string[]>([]);
	let submitting = $state(false);

	let formEl = $state<HTMLFormElement>();
	let pop = $state<'status' | 'tags' | null>(null);

	const statusMeta = $derived(PROJECT_STATUS[status] ?? PROJECT_STATUS.active);
	const icon = $derived((name.trim()[0] ?? 'P').toUpperCase());

	// Reset form fields from the project each time the modal opens.
	$effect(() => {
		if (open) {
			name = project.name;
			description = project.description ?? '';
			color = project.color;
			status = (project.status as Project['status']) ?? 'active';
			tags = [...(project.tags ?? [])];
			submitting = false;
			pop = null;
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
</script>

<svelte:window onkeydown={onKey} />

<Modal {open} {onclose} maxWidth={580}>
	<form
		bind:this={formEl}
		method="POST"
		action="?/update"
		use:enhance={() => {
			submitting = true;
			return async ({ result }: { result: ActionResult }) => {
				submitting = false;
				if (result.type === 'success') {
					showToast('ok', m.projects_updated_toast());
					await invalidateAll();
					onclose();
				} else if (result.type === 'failure') {
					showToast(
						'err',
						(result.data as { message?: string } | undefined)?.message ?? m.projects_update_failed()
					);
				} else if (result.type === 'error') {
					showToast('err', result.error?.message ?? m.projects_update_failed());
				}
			};
		}}
	>
		<div class="flex items-center border-b border-border px-5 pt-4 pb-3">
			<div>
				<div class="text-[12px] tracking-[0.08em] text-text-4 uppercase">
					{m.projects_settings_eyebrow()}
				</div>
				<div class="text-[15px] font-semibold">{m.projects_edit_title()}</div>
			</div>
			<button
				type="button"
				onclick={onclose}
				aria-label={m.common_close()}
				class="ml-auto grid h-8 w-8 place-items-center rounded-lg text-text-3 transition-colors hover:bg-surface hover:text-text"
			>
				<Icon name="x" size={15} />
			</button>
		</div>

		<div class="px-5 pt-5 pb-3">
			<div class="mb-4 flex items-start gap-3.5">
				<span
					class="relative grid size-12 shrink-0 place-items-center font-semibold text-white transition-[background] duration-200"
					style:border-radius="13px"
					style:font-size="22px"
					style:background="linear-gradient(140deg, {color}, color-mix(in oklch, {color} 70%, #000) 85%)"
					style:box-shadow="var(--shadow-edge), 0 6px 18px {color}33"
				>
					{icon}
				</span>
				<div class="min-w-0 flex-1">
					<input
						type="text"
						name="name"
						bind:value={name}
						required
						placeholder={m.projects_name_placeholder()}
						class="block w-full border-0 bg-transparent text-[22px] font-semibold tracking-[-0.01em] text-text outline-none placeholder:text-text-3"
					/>
					<div class="mt-1 flex items-center gap-1.5">
						<span class="text-[12px] tracking-[0.08em] text-text-4 uppercase"
							>{m.projects_key_label()}</span
						>
						<span class="font-mono text-[12px] text-text-2">{project.key}</span>
						<span class="text-[12px] text-text-4">·</span>
						<span class="text-[12px] text-text-3">{m.projects_key_cannot_change()}</span>
					</div>
				</div>
			</div>

			<textarea
				name="description"
				bind:value={description}
				placeholder={m.projects_description_placeholder()}
				rows="2"
				class="mb-4 w-full resize-none border-0 bg-transparent text-[14px] leading-relaxed text-text-2 outline-none placeholder:text-text-3"
			></textarea>

			<div class="mb-4">
				<div class="mb-2 text-[12px] tracking-[0.08em] text-text-4 uppercase">
					{m.projects_color_label()}
				</div>
				<div class="flex flex-wrap gap-1.5">
					{#each PALETTE as c (c)}
						<button
							type="button"
							onclick={() => (color = c)}
							aria-label={m.projects_pick_color({ color: c })}
							class="relative grid h-7 w-7 place-items-center rounded-lg transition-transform hover:scale-105 active:scale-95"
							style:background="linear-gradient(140deg, {c}, color-mix(in oklch, {c} 70%, #000) 85%)"
							style:box-shadow={color === c
								? `0 0 0 2px var(--bg-elev), 0 0 0 4px ${c}`
								: 'var(--shadow-edge)'}
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

			<div class="flex flex-wrap gap-2">
				<div class="relative">
					<button
						type="button"
						onclick={() => (pop = pop === 'status' ? null : 'status')}
						class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[14px] transition-colors hover:border-border-strong"
					>
						<span class="h-2 w-2 rounded-full" style:background={statusMeta.color}></span>
						<span>{projectStatusLabel(status)}</span>
						<Icon name="chevron" size={12} class="text-text-3" />
					</button>
					{#if pop === 'status'}
						<div
							use:clickOutside={() => (pop = null)}
							in:fly={POPOVER_IN}
							class="absolute top-full z-50 mt-1.5 min-w-[198px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
						>
							{#each STATUSES as s (s)}
								{@const meta = PROJECT_STATUS[s]}
								<button
									type="button"
									onclick={() => {
										status = s;
										pop = null;
									}}
									class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
								>
									<span class="h-2 w-2 rounded-full" style:background={meta.color}></span>
									<span class="text-[14px]">{projectStatusLabel(s)}</span>
									<span class="ml-auto text-accent {status === s ? 'opacity-100' : 'opacity-0'}">
										<Icon name="check" size={14} />
									</span>
								</button>
							{/each}
						</div>
					{/if}
				</div>

				<div class="relative">
					<button
						type="button"
						onclick={() => (pop = pop === 'tags' ? null : 'tags')}
						class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[14px] transition-colors {tags.length >
						0
							? 'border border-border bg-surface hover:border-border-strong'
							: 'border border-dashed border-border text-text-3 hover:border-border-strong hover:text-text'}"
					>
						{#if tags.length > 0}
							{#each tags.slice(0, 2) as t (t)}<LabelChip id={t} />{/each}
							{#if tags.length > 2}<span class="text-text-3">+{tags.length - 2}</span>{/if}
						{:else}
							<Icon name="bookmark" size={13} /> {m.tasks_tags()}
						{/if}
					</button>
					{#if pop === 'tags'}
						<TagsPopover
							value={tags}
							kind="project"
							onchange={(v) => (tags = v)}
							onclose={() => (pop = null)}
						/>
					{/if}
				</div>
			</div>

			{#each tags as t (t)}
				<input type="hidden" name="tags" value={t} />
			{/each}
			{#if tags.length === 0}
				<input type="hidden" name="tags" value="__clear__" />
			{/if}
			<input type="hidden" name="color" value={color} />
			<input type="hidden" name="status" value={status} />
		</div>

		<div class="flex items-center gap-2 rounded-b-2xl border-t border-border bg-bg/40 px-5 py-3">
			<span class="text-[12px] text-text-3">
				<Kbd>⌘↵</Kbd>
				{m.projects_kbd_to_save()}
			</span>
			<div class="ml-auto flex items-center gap-2">
				<Button variant="default" onclick={onclose}>{m.common_cancel()}</Button>
				<button
					type="submit"
					disabled={submitting || !name.trim()}
					class="inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-accent px-[12px] py-[8px] text-[14px] font-medium text-white shadow-btn transition-[background,border-color,transform] duration-150 hover:bg-accent-strong active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50"
				>
					{submitting ? m.common_saving() : m.common_save_changes()}
				</button>
			</div>
		</div>
	</form>
</Modal>
