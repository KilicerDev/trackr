<script lang="ts" module>
	// One task inside a project template. Mirrors the fields a real task starts
	// with; assignees, dates, comments, and attachments only exist per project.
	export type TemplateTaskDraft = {
		id: string;
		title: string;
		description: string | null;
		status: string;
		priority: string;
		type: string;
		estimateMinutes: number | null;
		tags: string[];
		checklist: { id: string; text: string; done: boolean }[];
	};
</script>

<script lang="ts">
	// Side panel for editing a template task. Same layout as the task
	// Inspector (header, title, property rail, description, checklist, tags)
	// so authoring a template feels like editing the task it will become.
	import Drawer from '../Drawer.svelte';
	import Icon from '../Icon.svelte';
	import IconButton from '../IconButton.svelte';
	import StatusDot from '../StatusDot.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import TypeBadge from '../TypeBadge.svelte';
	import LabelChip from '../LabelChip.svelte';
	import RichTextInput from '../RichTextInput.svelte';
	import Checklist from '../Checklist.svelte';
	import StatusPopover from '../popovers/StatusPopover.svelte';
	import PriorityPopover from '../popovers/PriorityPopover.svelte';
	import TypePopover from '../popovers/TypePopover.svelte';
	import EstimatePopover from '../popovers/EstimatePopover.svelte';
	import TagsPopover from '../popovers/TagsPopover.svelte';
	import { TRACKR_PRIORITIES } from '$lib/config/taxonomy';
	import { formatEstimate } from '$lib/utils/format';
	import { statusLabel, priorityLabel, typeLabel } from '$lib/utils/labels';
	import type { PriorityId, StatusId, TypeId } from '$lib/types';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		task: TemplateTaskDraft | null;
		/** Zero-based position in the template — shown as #n. */
		index: number;
		saving?: boolean;
		tagSuggestions?: string[];
		onclose: () => void;
		/** Apply a change to the task. `immediate` false = debounce (typing). */
		onpatch: (patch: Partial<TemplateTaskDraft>, immediate?: boolean) => void;
		ondelete: () => void;
	}
	let {
		task,
		index,
		saving = false,
		tagSuggestions = [],
		onclose,
		onpatch,
		ondelete
	}: Props = $props();

	let openPop = $state<string | null>(null);
	function toggle(id: string) {
		openPop = openPop === id ? null : id;
	}
	$effect(() => {
		// Close any picker when switching tasks.
		void task?.id;
		openPop = null;
	});

	const prio = $derived(TRACKR_PRIORITIES.find((p) => p.id === task?.priority));

	// Last committed title, so an emptied field can fall back to it.
	let lastTitle = $derived(task?.title ?? '');

	// Re-fits whenever the bound value (the title) changes, e.g. on task switch.
	function autosize(el: HTMLTextAreaElement, value: string) {
		void value;
		const fit = () => {
			el.style.height = 'auto';
			el.style.height = el.scrollHeight + 'px';
		};
		fit();
		return {
			update(next: string) {
				void next;
				fit();
			}
		};
	}
</script>

<Drawer open={!!task} {onclose}>
	{#if task}
		<div class="flex items-center gap-2 border-b border-border px-5 pt-4 pb-3">
			<TypeBadge type={task.type as TypeId} idText="#{index + 1}" showLabel={false} />
			<span class="rounded bg-surface px-1.5 py-0.5 font-mono text-[12px] text-text-3">
				{m.templates_inspector_chip()}
			</span>
			{#if saving}
				<span class="inline-flex items-center gap-1.5 text-[12px] text-text-3">
					<span
						class="h-2.5 w-2.5 animate-spin rounded-full border border-text-3 border-t-transparent"
					></span>
					{m.common_saving()}
				</span>
			{/if}
			<div class="ml-auto flex items-center gap-1">
				<IconButton size={31} ariaLabel={m.templates_aria_remove_task()} onclick={ondelete}>
					<Icon name="trash" size={15} />
				</IconButton>
				<IconButton size={31} ariaLabel={m.common_close()} onclick={onclose}>
					<Icon name="x" size={15} />
				</IconButton>
			</div>
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-24">
			<textarea
				use:autosize={task.title}
				value={task.title}
				rows="1"
				placeholder={m.tasks_untitled()}
				oninput={(e) => {
					const el = e.currentTarget;
					el.style.height = 'auto';
					el.style.height = el.scrollHeight + 'px';
					if (el.value.trim()) onpatch({ title: el.value }, false);
				}}
				onkeydown={(e) => {
					if (e.key === 'Enter' && !e.shiftKey) {
						e.preventDefault();
						e.currentTarget.blur();
					}
				}}
				onblur={(e) => {
					const next = e.currentTarget.value.trim();
					if (!next) {
						e.currentTarget.value = lastTitle;
						return;
					}
					if (next !== lastTitle) {
						lastTitle = next;
						onpatch({ title: next });
					}
				}}
				class="mb-4 w-full resize-none border-0 bg-transparent text-[22px] leading-tight font-semibold tracking-[-0.012em] text-text outline-none placeholder:text-text-4"
			></textarea>

			<!-- properties rail -->
			<div class="mb-5 flex flex-wrap gap-2">
				<div class="relative">
					<button
						type="button"
						onclick={() => toggle('type')}
						class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[14px] transition-colors hover:border-border-strong {openPop ===
						'type'
							? 'ring-2 ring-accent/40'
							: ''}"
					>
						<TypeBadge type={task.type as TypeId} showLabel={false} />
						<span>{typeLabel(task.type)}</span>
					</button>
					{#if openPop === 'type'}
						<TypePopover
							value={task.type as TypeId}
							onchange={(v) => onpatch({ type: v })}
							onclose={() => (openPop = null)}
						/>
					{/if}
				</div>

				<div class="relative">
					<button
						type="button"
						onclick={() => toggle('status')}
						class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[14px] transition-colors hover:border-border-strong {openPop ===
						'status'
							? 'ring-2 ring-accent/40'
							: ''}"
					>
						<StatusDot status={task.status as StatusId} />
						<span>{statusLabel(task.status)}</span>
					</button>
					{#if openPop === 'status'}
						<StatusPopover
							value={task.status as StatusId}
							onchange={(v) => onpatch({ status: v })}
							onclose={() => (openPop = null)}
						/>
					{/if}
				</div>

				<div class="relative">
					<button
						type="button"
						onclick={() => toggle('priority')}
						class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[14px] transition-colors hover:border-border-strong {openPop ===
						'priority'
							? 'ring-2 ring-accent/40'
							: ''}"
					>
						{#if prio && prio.bars > 0}
							<PriorityBars priority={task.priority as PriorityId} />
						{/if}
						<span>{priorityLabel(task.priority)}</span>
					</button>
					{#if openPop === 'priority'}
						<PriorityPopover
							value={task.priority as PriorityId}
							onchange={(v) => onpatch({ priority: v })}
							onclose={() => (openPop = null)}
						/>
					{/if}
				</div>

				<div class="relative">
					<button
						type="button"
						onclick={() => toggle('estimate')}
						class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[14px] transition-colors hover:border-border-strong {task.estimateMinutes
							? 'border border-border bg-surface'
							: 'border border-dashed border-border text-text-3 hover:text-text'} {openPop ===
						'estimate'
							? 'ring-2 ring-accent/40'
							: ''}"
					>
						{#if task.estimateMinutes}
							<span class="text-text-3">{m.tasks_est()}</span>
							<span class="font-mono">{formatEstimate(task.estimateMinutes)}</span>
						{:else}
							<span>{m.tasks_estimate()}</span>
						{/if}
					</button>
					{#if openPop === 'estimate'}
						<EstimatePopover
							value={task.estimateMinutes ?? undefined}
							onchange={(v) => onpatch({ estimateMinutes: v ?? null })}
							onclose={() => (openPop = null)}
						/>
					{/if}
				</div>
			</div>

			{#key task.id}
				<div class="mb-5">
					<RichTextInput
						value={task.description ?? ''}
						onchange={(v) => onpatch({ description: v || null }, false)}
						onblur={() => onpatch({ description: task?.description ?? null })}
						placeholder={m.tasks_description_placeholder()}
						flavor="document"
						mentions={false}
						rows={3}
						maxRows={16}
						class="w-full border-0 bg-transparent text-[14px] leading-relaxed text-text-2"
					/>
				</div>
			{/key}

			<Checklist
				items={task.checklist}
				canEdit
				label={m.tasks_checklist()}
				addPlaceholder={m.tasks_checklist_add()}
				onChange={(items) => onpatch({ checklist: items })}
			/>
			{#if task.checklist.length > 0}
				<p class="-mt-4 mb-6 text-[12px] text-text-4">{m.templates_inspector_checklist_hint()}</p>
			{/if}

			<div class="mb-6 flex flex-wrap items-center gap-2">
				{#each task.tags as t (t)}<LabelChip id={t} />{/each}
				<div class="relative">
					<button
						type="button"
						onclick={() => toggle('tags')}
						class="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2 py-1 text-[13px] text-text-3 transition-colors hover:border-border-strong hover:text-text {openPop ===
						'tags'
							? 'ring-2 ring-accent/40'
							: ''}"
					>
						<Icon name="bookmark" size={13} />
						<span>{task.tags.length > 0 ? m.tasks_add_tag() : m.tasks_add_tags()}</span>
					</button>
					{#if openPop === 'tags'}
						<TagsPopover
							value={task.tags}
							suggestions={tagSuggestions}
							onchange={(v) => onpatch({ tags: v })}
							onclose={() => (openPop = null)}
						/>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</Drawer>
