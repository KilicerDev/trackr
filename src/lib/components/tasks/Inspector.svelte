<script lang="ts">
	import type { PriorityId, StatusId, Task } from '$lib/types';
	import Drawer from '../Drawer.svelte';
	import StatusDot from '../StatusDot.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import LabelChip from '../LabelChip.svelte';
	import Avatar from '../Avatar.svelte';
	import AvatarStack from '../AvatarStack.svelte';
	import Icon from '../Icon.svelte';
	import IconButton from '../IconButton.svelte';
	import TypeBadge from '../TypeBadge.svelte';
	import TimeLogger from './TimeLogger.svelte';
	import StatusPopover from '../popovers/StatusPopover.svelte';
	import PriorityPopover from '../popovers/PriorityPopover.svelte';
	import AssigneePopover from '../popovers/AssigneePopover.svelte';
	import DatePopover from '../popovers/DatePopover.svelte';
	import EstimatePopover from '../popovers/EstimatePopover.svelte';
	import {
		TRACKR_PRIORITIES,
		TRACKR_STATUSES,
		TRACKR_PROJECTS,
		userById,
		formatDateLong,
		formatEstimate
	} from '$lib/data';

	interface Props {
		task: Task | null;
		onclose: () => void;
	}
	let { task, onclose }: Props = $props();

	// Local editable state — fresh copy whenever a new task opens
	let draft = $state<Task | null>(null);
	$effect(() => {
		draft = task ? { ...task, assignees: task.assignees ?? [task.assignee] } : null;
	});

	type PopId = 'status' | 'priority' | 'assignees' | 'due' | 'estimate' | null;
	let openPop = $state<PopId>(null);

	let status = $derived.by(() => {
		const d = draft;
		return d ? TRACKR_STATUSES.find((s) => s.id === d.status)! : null;
	});
	let prio = $derived.by(() => {
		const d = draft;
		return d ? TRACKR_PRIORITIES.find((p) => p.id === d.priority)! : null;
	});
	let assigneeIds = $derived.by(() => {
		const d = draft;
		return d ? (d.assignees ?? [d.assignee]) : [];
	});
	let assignees = $derived(assigneeIds.map((id) => userById(id)));
	let project = $derived.by(() => {
		const d = draft;
		return d ? TRACKR_PROJECTS[d.project] : null;
	});

	let events = $derived.by(() => {
		if (!draft) return [];
		const list: { kind: string; user: string; date: string; data?: any }[] = [];
		(draft.comments ?? []).forEach((c) =>
			list.push({ kind: 'comment', user: c.user, date: c.date, data: c.text })
		);
		(draft.timeLogs ?? []).forEach((t) =>
			list.push({ kind: 'time', user: t.user, date: t.date, data: t })
		);
		if (draft.createdBy && draft.createdAt) {
			list.push({ kind: 'created', user: draft.createdBy, date: draft.createdAt });
		}
		return list.sort((a, b) => (a.date < b.date ? 1 : -1));
	});

	function toggle(id: PopId) {
		openPop = openPop === id ? null : id;
	}
</script>

<Drawer open={!!task} {onclose}>
	{#if draft && status && prio && project}
		<div class="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-border">
			<TypeBadge type={draft.type ?? 'task'} idText={draft.id} showLabel={false} />
			<span class="font-mono text-[11px] text-text-3 px-1.5 py-0.5 rounded bg-surface">
				{project.name}
			</span>
			<div class="ml-auto flex items-center gap-1">
				<IconButton size={28} ariaLabel="Copy link"><Icon name="link" size={14} /></IconButton>
				<IconButton size={28} ariaLabel="More"><Icon name="settings" size={14} /></IconButton>
				<IconButton size={28} ariaLabel="Close" onclick={onclose}><Icon name="x" size={14} /></IconButton>
			</div>
		</div>

		<div class="flex-1 min-h-0 overflow-y-auto px-5 pt-4 pb-24">
			<h2 class="text-[20px] font-semibold tracking-[-0.012em] leading-tight mb-4 text-text">{draft.title}</h2>

			<!-- properties rail -->
			<div class="flex flex-wrap gap-2 mb-5">
				<!-- STATUS -->
				<div class="relative">
					<button
						type="button"
						onclick={() => toggle('status')}
						class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-border hover:border-border-strong text-[12.5px] transition-colors {openPop === 'status' ? 'ring-2 ring-accent/40' : ''}"
					>
						<StatusDot status={draft.status} />
						<span>{status.label}</span>
					</button>
					{#if openPop === 'status'}
						<StatusPopover
							value={draft.status}
							onchange={(v: StatusId) => (draft!.status = v)}
							onclose={() => (openPop = null)}
						/>
					{/if}
				</div>

				<!-- PRIORITY -->
				<div class="relative">
					<button
						type="button"
						onclick={() => toggle('priority')}
						class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-border hover:border-border-strong text-[12.5px] transition-colors {openPop === 'priority' ? 'ring-2 ring-accent/40' : ''}"
					>
						{#if prio.bars > 0}
							<PriorityBars priority={draft.priority} />
						{/if}
						<span>{prio.label}</span>
					</button>
					{#if openPop === 'priority'}
						<PriorityPopover
							value={draft.priority}
							onchange={(v: PriorityId) => (draft!.priority = v)}
							onclose={() => (openPop = null)}
						/>
					{/if}
				</div>

				<!-- ASSIGNEES -->
				<div class="relative">
					<button
						type="button"
						onclick={() => toggle('assignees')}
						class="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface border border-border hover:border-border-strong text-[12.5px] transition-colors {openPop === 'assignees' ? 'ring-2 ring-accent/40' : ''}"
					>
						{#if assignees.length === 1}
							<Avatar user={assignees[0]} size={18} />
							<span>{assignees[0]?.name}</span>
						{:else if assignees.length === 0}
							<span class="text-text-3">Unassigned</span>
						{:else}
							<AvatarStack users={assignees} size={18} max={3} overlap={5} />
							<span>{assignees.length} assignees</span>
						{/if}
					</button>
					{#if openPop === 'assignees'}
						<AssigneePopover
							value={assigneeIds}
							onchange={(v) => {
								if (draft) {
									draft.assignees = v;
									if (v.length > 0) draft.assignee = v[0];
								}
							}}
							onclose={() => (openPop = null)}
						/>
					{/if}
				</div>

				<!-- DUE -->
				<div class="relative">
					<button
						type="button"
						onclick={() => toggle('due')}
						class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12.5px] transition-colors {draft.due ? 'bg-surface border border-border hover:border-border-strong' : 'border border-dashed border-border text-text-3 hover:text-text hover:border-border-strong'} {openPop === 'due' ? 'ring-2 ring-accent/40' : ''}"
					>
						<Icon name="calendar" size={13} />
						{#if draft.due}
							<span class="font-mono">{formatDateLong(draft.due)}</span>
						{:else}
							<span>Due date</span>
						{/if}
					</button>
					{#if openPop === 'due'}
						<DatePopover
							value={draft.due}
							onchange={(v) => (draft!.due = v)}
							onclose={() => (openPop = null)}
						/>
					{/if}
				</div>

				<!-- ESTIMATE -->
				<div class="relative">
					<button
						type="button"
						onclick={() => toggle('estimate')}
						class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12.5px] transition-colors {draft.estimate ? 'bg-surface border border-border hover:border-border-strong' : 'border border-dashed border-border text-text-3 hover:text-text hover:border-border-strong'} {openPop === 'estimate' ? 'ring-2 ring-accent/40' : ''}"
					>
						{#if draft.estimate}
							<span class="text-text-3">Est</span>
							<span class="font-mono">{formatEstimate(draft.estimate)}</span>
						{:else}
							<span>Estimate</span>
						{/if}
					</button>
					{#if openPop === 'estimate'}
						<EstimatePopover
							value={draft.estimate}
							onchange={(v) => (draft!.estimate = v)}
							onclose={() => (openPop = null)}
						/>
					{/if}
				</div>
			</div>

			<div class="text-[13.5px] leading-relaxed text-text-2 whitespace-pre-wrap mb-5">
				{draft.description ?? 'Add a description…'}
			</div>

			{#if draft.parent || (draft.labels && draft.labels.length > 0)}
				<div class="flex flex-wrap gap-2 mb-6">
					{#if draft.parent}
						<span class="inline-flex items-center gap-1.5 text-[11.5px] font-mono px-2 py-1 rounded border border-border bg-surface text-text-3">
							<Icon name="chevron-r" size={11} /> {draft.parent}
						</span>
					{/if}
					{#each draft.labels as l (l)}<LabelChip id={l} />{/each}
				</div>
			{/if}

			{#if draft.attachments && draft.attachments.length > 0}
				<div class="mb-6">
					<div class="text-[11px] uppercase tracking-[0.08em] text-text-4 mb-2">Attachments</div>
					<div class="space-y-1.5">
						{#each draft.attachments as a (a.name)}
							<div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-border text-[12.5px]">
								<Icon name="link" size={13} />
								<span class="truncate">{a.name}</span>
								<span class="ml-auto font-mono text-[11px] text-text-3">{a.size}</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<div class="mt-4">
				<div class="text-[11px] uppercase tracking-[0.08em] text-text-4 mb-3">Activity</div>
				<div class="mb-4">
					<TimeLogger task={draft} />
				</div>
				<div class="relative space-y-4 pl-7">
					<span class="absolute left-[10px] top-2 bottom-2 w-px bg-border"></span>
					{#each events as e (e.date + e.kind)}
						{@const u = userById(e.user)}
						<div class="relative">
							<span class="absolute -left-7 top-0.5 w-5 h-5 rounded-full grid place-items-center bg-bg-elev border border-border">
								{#if e.kind === 'comment'}
									<Avatar user={u} size={18} />
								{:else if e.kind === 'time'}
									<Icon name="calendar" size={11} />
								{:else if e.kind === 'created'}
									<Icon name="plus" size={11} />
								{/if}
							</span>
							<div class="text-[12.5px] text-text-2">
								<span class="text-text font-medium">{u?.name ?? e.user}</span>
								{#if e.kind === 'comment'}commented
								{:else if e.kind === 'time'}logged <span class="text-text font-medium">{formatEstimate(e.data.minutes)}</span>
								{:else if e.kind === 'created'}created this task
								{/if}
								<span class="font-mono text-text-4">· {e.date}</span>
							</div>
							{#if e.kind === 'comment'}
								<div class="mt-2 p-3 rounded-lg bg-surface border border-border text-[13px] leading-relaxed text-text">
									{e.data}
								</div>
							{:else if e.kind === 'time' && e.data.note}
								<div class="mt-1.5 text-[12.5px] text-text-3 italic">{e.data.note}</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>

			<div class="mt-8 text-[11px] text-text-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-4">
				{#if draft.createdBy}<span>Created by <span class="text-text-2">{userById(draft.createdBy)?.name}</span></span>{/if}
				{#if draft.createdAt}<span>Created <span class="font-mono text-text-3">{draft.createdAt}</span></span>{/if}
				<span>Updated <span class="font-mono text-text-3">{draft.updated}</span></span>
			</div>
		</div>

		<div class="border-t border-border bg-bg-elev p-3">
			<div class="flex items-end gap-2">
				<textarea
					placeholder="Write a comment…"
					rows="3"
					class="flex-1 resize-none bg-surface border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:border-border-strong min-h-[72px]"
				></textarea>
				<div class="flex flex-col gap-2">
					<button
						type="button"
						aria-label="Attach"
						class="w-8 h-8 grid place-items-center rounded-lg bg-surface border border-border text-text-2 hover:text-text hover:bg-surface-2 hover:border-border-strong transition-colors"
					>
						<Icon name="paperclip" size={13} />
					</button>
					<button
						type="button"
						aria-label="Send"
						class="w-8 h-8 grid place-items-center rounded-lg bg-accent hover:bg-accent-strong text-white shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_4px_12px_rgba(239,122,109,0.25)] transition-colors"
					>
						<Icon name="send" size={13} />
					</button>
				</div>
			</div>
		</div>
	{/if}
</Drawer>
