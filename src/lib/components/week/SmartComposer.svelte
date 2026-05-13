<script lang="ts">
	import Icon from '../Icon.svelte';
	import Kbd from '../Kbd.svelte';
	import IconButton from '../IconButton.svelte';
	import Avatar from '../Avatar.svelte';
	import PriorityPopover from '../popovers/PriorityPopover.svelte';
	import ProjectPopover from '../popovers/ProjectPopover.svelte';
	import EstimatePopover from '../popovers/EstimatePopover.svelte';
	import AssigneePopover from '../popovers/AssigneePopover.svelte';
	import {
		TRACKR_PRIORITIES,
		TRACKR_PROJECTS,
		TRACKR_USERS,
		formatEstimate,
		userById
	} from '$lib/data';
	import type { PriorityId, ProjectId } from '$lib/types';

	export interface ComposerDraft {
		title: string;
		project: ProjectId;
		priority: PriorityId;
		assignee: string;
		estimate: number;
	}

	interface Props {
		onsubmit?: (text: string) => void;
		oncancel?: () => void;
		onexpand?: (draft: ComposerDraft) => void;
	}
	let { onsubmit, oncancel, onexpand }: Props = $props();

	let text = $state('');
	let focused = $state(true);
	let inputEl = $state<HTMLInputElement>();

	// Manual overrides — when set, take precedence over token parsing.
	let projectOverride = $state<ProjectId | null>(null);
	let priorityOverride = $state<PriorityId | null>(null);
	let assigneeOverride = $state<string | null>(null);
	let estimateOverride = $state<number | null>(null);

	let pop = $state<'project' | 'priority' | 'assignee' | 'estimate' | null>(null);

	const PROJECT_TOKENS: Record<string, ProjectId> = {
		'+siweb': 'SIWEB',
		'+trackr': 'TRACKR',
		'+maja': 'MAJA',
		'+webim': 'WEBIM'
	};

	const PRIO_TOKENS: Record<string, PriorityId> = {
		'!urgent': 'urgent',
		'!high': 'high',
		'!medium': 'medium',
		'!low': 'low',
		'!none': 'none'
	};

	function parseEstimate(token: string): number | null {
		const m = token.match(/^~(?:(\d+)h)?(?:(\d+)m)?$/);
		if (!m) return null;
		const h = parseInt(m[1] ?? '0');
		const min = parseInt(m[2] ?? '0');
		if (!h && !min) return null;
		return h * 60 + min;
	}

	let parsed = $derived.by(() => {
		const tokens = text.toLowerCase().split(/\s+/);
		let project: ProjectId = 'TRACKR';
		let priority: PriorityId = 'medium';
		let assignee = 'u6';
		let estimate = 60;
		let projectFromToken = false;
		let prioFromToken = false;
		let assigneeFromToken = false;
		let estimateFromToken = false;

		for (const t of tokens) {
			if (PROJECT_TOKENS[t]) {
				project = PROJECT_TOKENS[t];
				projectFromToken = true;
			} else if (PRIO_TOKENS[t]) {
				priority = PRIO_TOKENS[t];
				prioFromToken = true;
			} else if (t.startsWith('@')) {
				const name = t.slice(1);
				const u = TRACKR_USERS.find(
					(u) => u.name.toLowerCase().startsWith(name) || u.initials.toLowerCase() === name
				);
				if (u) {
					assignee = u.id;
					assigneeFromToken = true;
				}
			} else if (t.startsWith('~')) {
				const e = parseEstimate(t);
				if (e !== null) {
					estimate = e;
					estimateFromToken = true;
				}
			}
		}

		return {
			project,
			priority,
			assignee,
			estimate,
			projectFromToken,
			prioFromToken,
			assigneeFromToken,
			estimateFromToken
		};
	});

	// Effective values: override > token > default
	let project = $derived(projectOverride ?? parsed.project);
	let priority = $derived(priorityOverride ?? parsed.priority);
	let assignee = $derived(assigneeOverride ?? parsed.assignee);
	let estimate = $derived(estimateOverride ?? parsed.estimate);

	let projectActive = $derived(projectOverride !== null || parsed.projectFromToken);
	let priorityActive = $derived(priorityOverride !== null || parsed.prioFromToken);
	let assigneeActive = $derived(assigneeOverride !== null || parsed.assigneeFromToken);
	let estimateActive = $derived(estimateOverride !== null || parsed.estimateFromToken);

	// Strip tokens out of the title so the expanded modal gets the clean text
	let cleanTitle = $derived(
		text
			.split(/\s+/)
			.filter(
				(t) =>
					!PROJECT_TOKENS[t.toLowerCase()] &&
					!PRIO_TOKENS[t.toLowerCase()] &&
					!t.startsWith('@') &&
					!t.startsWith('~')
			)
			.join(' ')
	);

	function submit() {
		if (!text.trim()) return;
		onsubmit?.(text);
		text = '';
		projectOverride = null;
		priorityOverride = null;
		assigneeOverride = null;
		estimateOverride = null;
	}

	function expand() {
		onexpand?.({
			title: cleanTitle,
			project,
			priority,
			assignee,
			estimate
		});
	}

	function handleKey(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			if (e.metaKey || e.ctrlKey) expand();
			else submit();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			oncancel?.();
		}
	}

	$effect(() => {
		inputEl?.focus();
	});

	function chipClass(active: boolean) {
		return active
			? 'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11.5px] border border-accent text-text transition-colors hover:bg-accent-soft hover:border-accent'
			: 'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11.5px] border border-border bg-bg-elev text-text-2 hover:text-text hover:border-border-strong transition-colors';
	}
</script>

<div
	class="bg-surface border-2 rounded-xl p-2.5 mx-3.5 my-2 shadow-[0_8px_20px_-12px_rgba(0,0,0,0.4)] transition-colors {focused
		? 'border-accent'
		: 'border-border'}"
>
	<div class="flex items-center gap-2 px-1">
		<Icon name="plus" size={14} />
		<input
			bind:this={inputEl}
			type="text"
			bind:value={text}
			onkeydown={handleKey}
			onfocus={() => (focused = true)}
			onblur={() => (focused = false)}
			placeholder="Type a task… use +PROJ !prio @user ~2h"
			class="flex-1 bg-transparent border-0 outline-none text-[13.5px] placeholder:text-text-3"
		/>
		<Kbd>⌘↵</Kbd>
		<IconButton size={26} ariaLabel="Open in modal" onclick={expand}>
			<Icon name="arrow-up" size={12} class="rotate-45" />
		</IconButton>
		<IconButton size={26} ariaLabel="Cancel" onclick={oncancel}>
			<Icon name="x" size={12} />
		</IconButton>
	</div>
	<div class="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-border/60">
		<!-- Project chip -->
		<div class="relative">
			<button
				type="button"
				onmousedown={(e) => e.preventDefault()}
				onclick={() => (pop = pop === 'project' ? null : 'project')}
				class={chipClass(projectActive)}
				style:background={projectActive ? 'rgba(239,122,109,0.14)' : undefined}
			>
				<span class="w-2 h-2 rounded-full" style:background={TRACKR_PROJECTS[project].color}
				></span>
				{TRACKR_PROJECTS[project].name}
			</button>
			{#if pop === 'project'}
				<ProjectPopover
					value={project}
					onchange={(v) => (projectOverride = v)}
					onclose={() => (pop = null)}
				/>
			{/if}
		</div>

		<!-- Priority chip -->
		<div class="relative">
			<button
				type="button"
				onmousedown={(e) => e.preventDefault()}
				onclick={() => (pop = pop === 'priority' ? null : 'priority')}
				class={chipClass(priorityActive)}
				style:background={priorityActive ? 'rgba(239,122,109,0.14)' : undefined}
			>
				{TRACKR_PRIORITIES.find((p) => p.id === priority)!.label}
			</button>
			{#if pop === 'priority'}
				<PriorityPopover
					value={priority}
					onchange={(v) => (priorityOverride = v)}
					onclose={() => (pop = null)}
				/>
			{/if}
		</div>

		<!-- Assignee chip -->
		<div class="relative">
			<button
				type="button"
				onmousedown={(e) => e.preventDefault()}
				onclick={() => (pop = pop === 'assignee' ? null : 'assignee')}
				class={chipClass(assigneeActive)}
				style:background={assigneeActive ? 'rgba(239,122,109,0.14)' : undefined}
			>
				<Avatar user={userById(assignee)} size={14} />
				{userById(assignee)?.name}
			</button>
			{#if pop === 'assignee'}
				<AssigneePopover
					value={[assignee]}
					onchange={(v) => (assigneeOverride = v[0] ?? null)}
					onclose={() => (pop = null)}
				/>
			{/if}
		</div>

		<!-- Estimate chip -->
		<div class="relative">
			<button
				type="button"
				onmousedown={(e) => e.preventDefault()}
				onclick={() => (pop = pop === 'estimate' ? null : 'estimate')}
				class={chipClass(estimateActive) + ' font-mono'}
				style:background={estimateActive ? 'rgba(239,122,109,0.14)' : undefined}
			>
				{formatEstimate(estimate)}
			</button>
			{#if pop === 'estimate'}
				<EstimatePopover
					value={estimate}
					onchange={(v) => (estimateOverride = v ?? null)}
					onclose={() => (pop = null)}
				/>
			{/if}
		</div>

		<span class="ml-auto text-[10.5px] text-text-4">
			Tokens: <span class="font-mono">+PROJ</span>
			<span class="font-mono">!prio</span>
			<span class="font-mono">@user</span>
			<span class="font-mono">~2h</span>
		</span>
	</div>
</div>
