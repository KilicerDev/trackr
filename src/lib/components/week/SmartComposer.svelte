<script lang="ts">
	import Icon from '../Icon.svelte';
	import Kbd from '../Kbd.svelte';
	import IconButton from '../IconButton.svelte';
	import Avatar from '../Avatar.svelte';
	import PriorityPopover from '../popovers/PriorityPopover.svelte';
	import ProjectPopover from '../popovers/ProjectPopover.svelte';
	import EstimatePopover from '../popovers/EstimatePopover.svelte';
	import AssigneePopover from '../popovers/AssigneePopover.svelte';
	import { TRACKR_PRIORITIES, formatEstimate } from '$lib/data';
	import type { PriorityId } from '$lib/types';

	type AssignableUser = {
		id: string;
		name: string;
		email: string;
		initials: string;
		color: string;
		status: 'active' | 'invited' | 'disabled';
	};
	type PickableProject = { key: string; name: string; color: string; icon: string };

	export interface ComposerDraft {
		title: string;
		project: string;
		priority: PriorityId;
		assignee: string;
		estimate: number;
	}

	interface Props {
		users: AssignableUser[];
		projects: PickableProject[];
		currentUserId: string;
		onsubmit?: (draft: ComposerDraft) => void;
		oncancel?: () => void;
		onexpand?: (draft: ComposerDraft) => void;
	}
	let { users, projects, currentUserId, onsubmit, oncancel, onexpand }: Props = $props();

	let text = $state('');
	let focused = $state(true);
	let inputEl = $state<HTMLInputElement>();

	const defaultProject = $derived(projects[0]?.key ?? '');

	// Manual overrides — when set, take precedence over token parsing.
	let projectOverride = $state<string | null>(null);
	let priorityOverride = $state<PriorityId | null>(null);
	let assigneeOverride = $state<string | null>(null);
	let estimateOverride = $state<number | null>(null);

	let pop = $state<'project' | 'priority' | 'assignee' | 'estimate' | null>(null);

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
		const tokens = text.split(/\s+/);
		let project: string = defaultProject;
		let priority: PriorityId = 'medium';
		let assignee = currentUserId;
		let estimate = 60;
		let projectFromToken = false;
		let prioFromToken = false;
		let assigneeFromToken = false;
		let estimateFromToken = false;

		const projectByKey = new Map(projects.map((p) => [p.key.toLowerCase(), p.key]));

		for (const raw of tokens) {
			const t = raw.toLowerCase();
			if (raw.startsWith('+')) {
				const key = projectByKey.get(raw.slice(1).toLowerCase());
				if (key) {
					project = key;
					projectFromToken = true;
				}
			} else if (PRIO_TOKENS[t]) {
				priority = PRIO_TOKENS[t];
				prioFromToken = true;
			} else if (raw.startsWith('@')) {
				const name = raw.slice(1).toLowerCase();
				const u = users.find(
					(u) =>
						u.name.toLowerCase().startsWith(name) ||
						u.initials.toLowerCase() === name ||
						u.email.toLowerCase().startsWith(name)
				);
				if (u) {
					assignee = u.id;
					assigneeFromToken = true;
				}
			} else if (raw.startsWith('~')) {
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

	let project = $derived(projectOverride ?? parsed.project);
	let priority = $derived(priorityOverride ?? parsed.priority);
	let assignee = $derived(assigneeOverride ?? parsed.assignee);
	let estimate = $derived(estimateOverride ?? parsed.estimate);

	let projectActive = $derived(projectOverride !== null || parsed.projectFromToken);
	let priorityActive = $derived(priorityOverride !== null || parsed.prioFromToken);
	let assigneeActive = $derived(assigneeOverride !== null || parsed.assigneeFromToken);
	let estimateActive = $derived(estimateOverride !== null || parsed.estimateFromToken);

	let projectMeta = $derived(
		projects.find((p) => p.key === project) ?? {
			key: '',
			name: '—',
			color: '#7c7c84',
			icon: '?'
		}
	);
	let assigneeUser = $derived(users.find((u) => u.id === assignee));

	// Strip tokens out of the title so the expanded modal gets the clean text
	let cleanTitle = $derived(
		text
			.split(/\s+/)
			.filter((raw) => {
				const t = raw.toLowerCase();
				if (raw.startsWith('+')) return false;
				if (PRIO_TOKENS[t]) return false;
				if (raw.startsWith('@')) return false;
				if (raw.startsWith('~')) return false;
				return true;
			})
			.join(' ')
			.trim()
	);

	function draft(): ComposerDraft {
		return { title: cleanTitle, project, priority, assignee, estimate };
	}

	function submit() {
		if (!cleanTitle) return;
		if (!project) return;
		onsubmit?.(draft());
		text = '';
		projectOverride = null;
		priorityOverride = null;
		assigneeOverride = null;
		estimateOverride = null;
	}

	function expand() {
		onexpand?.(draft());
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
				<span class="w-2 h-2 rounded-full" style:background={projectMeta.color}></span>
				{projectMeta.name}
			</button>
			{#if pop === 'project'}
				<ProjectPopover
					value={project as never}
					onchange={(v) => (projectOverride = v as unknown as string)}
					onclose={() => (pop = null)}
					{projects}
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
				{#if assigneeUser}
					<Avatar user={assigneeUser} size={14} />
					{assigneeUser.name}
				{:else}
					<span class="text-text-3">Unassigned</span>
				{/if}
			</button>
			{#if pop === 'assignee'}
				<AssigneePopover
					value={[assignee]}
					onchange={(v) => (assigneeOverride = v[0] ?? null)}
					onclose={() => (pop = null)}
					{users}
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
