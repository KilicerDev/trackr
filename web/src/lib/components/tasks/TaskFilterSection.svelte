<script lang="ts">
	// The "Filters" card for task lists: status, priority, assignee, project
	// and tags, each with its value list. Shared by the /tasks toolbar, the
	// project task toolbar and My Week so the three filter the same way; the
	// matching itself is matchesTaskFilters() in $lib/utils/task-filters.
	import Icon from '../Icon.svelte';
	import StatusDot from '../StatusDot.svelte';
	import PriorityBars from '../PriorityBars.svelte';
	import Avatar from '../Avatar.svelte';
	import FilterSection from '../view-panel/FilterSection.svelte';
	import type { FilterField } from '../view-panel/FilterSection.svelte';
	import { TRACKR_PRIORITIES, TRACKR_STATUSES } from '$lib/config/taxonomy';
	import { labelMeta } from '$lib/utils/label-meta';
	import { page } from '$app/state';
	import { statusLabel, priorityLabel } from '$lib/utils/labels';
	import { m } from '$lib/paraglide/messages';
	import type { TaskFilterField } from '$lib/utils/task-filters';

	type LayoutData = {
		users?: {
			id: string;
			name: string;
			initials: string;
			color: string;
			status: string;
			internal?: boolean;
		}[];
		projects?: { key: string; name: string; color: string }[];
	};

	interface Props {
		filters: Record<string, string[]>;
		setFilters: (f: Record<string, string[]>) => void;
		/** Which fields to offer, in order. */
		fields?: TaskFilterField[];
		/** Tag vocabulary (the tags in use on the tasks being filtered). */
		tags: string[];
		/** Offer the "Unassigned" row under assignee. */
		unassigned?: boolean;
	}
	let {
		filters,
		setFilters,
		fields = ['status', 'priority', 'assignee', 'project', 'tags'],
		tags,
		unassigned = true
	}: Props = $props();

	const ALL_FIELDS: Record<TaskFilterField, () => FilterField> = {
		status: () => ({ id: 'status', label: m.tasks_group_status(), icon: 'check' }),
		priority: () => ({ id: 'priority', label: m.tasks_group_priority(), icon: 'filter' }),
		assignee: () => ({
			id: 'assignee',
			label: m.tasks_group_assignee(),
			icon: 'users',
			searchable: true
		}),
		project: () => ({
			id: 'project',
			label: m.tasks_group_project(),
			icon: 'folder',
			searchable: true
		}),
		tags: () => ({ id: 'tags', label: m.tasks_tags(), icon: 'bookmark', searchable: true })
	};
	const FIELDS = $derived(fields.map((f) => ALL_FIELDS[f]()));

	// Search inside a long value list (query arrives lower-cased and trimmed).
	const hit = (label: string, query: string) => !query || label.toLowerCase().includes(query);

	function toggleValue(field: string, value: string) {
		const cur = filters[field] ?? [];
		const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
		const merged = { ...filters, [field]: next };
		if (next.length === 0) delete merged[field];
		setFilters(merged);
	}

	// Resolve a raw filter value (status id, user id, project key, …) to the
	// human label shown in the row summary. Falls back to the raw value if no
	// match — better to surface a stale id than to blank the row out.
	function valueLabel(field: string, value: string): string {
		if (field === 'status')
			return TRACKR_STATUSES.find((s) => s.id === value) ? statusLabel(value) : value;
		if (field === 'priority')
			return TRACKR_PRIORITIES.find((p) => p.id === value) ? priorityLabel(value) : value;
		if (field === 'assignee') {
			if (value === '__unassigned__') return m.common_unassigned();
			const u = ((page.data as LayoutData).users ?? []).find((x) => x.id === value);
			return u?.name ?? value;
		}
		if (field === 'project') {
			const p = ((page.data as LayoutData).projects ?? []).find((x) => x.key === value);
			return p?.name ?? value;
		}
		if (field === 'tags') return labelMeta(value).label;
		return value;
	}
</script>

{#snippet valuesList(field: string, query: string)}
	{@const values = filters[field] ?? []}
	{#if field === 'status'}
		{#each TRACKR_STATUSES.filter((s) => hit(statusLabel(s.id), query)) as s (s.id)}
			<button
				type="button"
				onclick={() => toggleValue('status', s.id)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<StatusDot status={s.id} />
				<span class="text-[14px]">{statusLabel(s.id)}</span>
				<span class="ml-auto text-accent {values.includes(s.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={14} />
				</span>
			</button>
		{/each}
	{:else if field === 'priority'}
		{#each TRACKR_PRIORITIES.filter((p) => hit(priorityLabel(p.id), query)) as p (p.id)}
			<button
				type="button"
				onclick={() => toggleValue('priority', p.id)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<PriorityBars priority={p.id} />
				<span class="text-[14px]">{priorityLabel(p.id)}</span>
				<span class="ml-auto text-accent {values.includes(p.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={14} />
				</span>
			</button>
		{/each}
	{:else if field === 'assignee'}
		<!-- Tasks are internal work, so only platform (internal team) users can be
		     assignees — mirror the tickets toolbar and hide client/portal users. -->
		{@const dbUsers = ((page.data as LayoutData).users ?? []).filter(
			(u) => u.internal && u.status !== 'disabled'
		)}
		<!-- `__unassigned__` sentinel: matches tasks with no assignee. -->
		{#if unassigned && hit(m.common_unassigned(), query)}
			<button
				type="button"
				onclick={() => toggleValue('assignee', '__unassigned__')}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<span
					class="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-dashed border-text-3 text-text-3"
				>
					<Icon name="user" size={12} />
				</span>
				<span class="text-[14px]">{m.common_unassigned()}</span>
				<span
					class="ml-auto text-accent {values.includes('__unassigned__')
						? 'opacity-100'
						: 'opacity-0'}"
				>
					<Icon name="check" size={14} />
				</span>
			</button>
		{/if}
		{#each dbUsers.filter((u) => hit(u.name, query)) as u (u.id)}
			<button
				type="button"
				onclick={() => toggleValue('assignee', u.id)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<Avatar user={u} size={22} />
				<span class="text-[14px]">{u.name}</span>
				<span class="ml-auto text-accent {values.includes(u.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={14} />
				</span>
			</button>
		{/each}
	{:else if field === 'project'}
		{@const dbProjects = (page.data as LayoutData).projects ?? []}
		{#each dbProjects.filter((p) => hit(p.name, query)) as p (p.key)}
			<button
				type="button"
				onclick={() => toggleValue('project', p.key)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<span class="h-2 w-2 rounded-full" style:background={p.color}></span>
				<span class="text-[14px]">{p.name}</span>
				<span class="ml-auto text-accent {values.includes(p.key) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={14} />
				</span>
			</button>
		{/each}
	{:else if field === 'tags'}
		{#each tags.filter((id) => hit(labelMeta(id).label, query)) as id (id)}
			{@const l = labelMeta(id)}
			<button
				type="button"
				onclick={() => toggleValue('tags', id)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<span class="h-2 w-2 rounded-full" style:background={l.color}></span>
				<span class="truncate text-[14px]">{l.label}</span>
				<span class="ml-auto text-accent {values.includes(id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={14} />
				</span>
			</button>
		{/each}
		{#if tags.length === 0}
			<div class="px-2 py-2 text-[12px] text-text-3">{m.common_none()}</div>
		{/if}
	{/if}
{/snippet}

<FilterSection fields={FIELDS} {filters} {setFilters} {valueLabel} {valuesList} />
