<script lang="ts">
	// Bulk "create tasks from to-dos" stepper.
	//
	// Given a list of open (unchecked) todos pulled from the note editor, this
	// modal lets you walk them one at a time (◀ ▶), tweak the full task fields per
	// todo, toggle which ones to include, then "Create all" in one go. Each
	// included draft is POSTed to the standard /tasks?/create action; the caller
	// gets back the {todo → created task} mapping so it can tick the todos and
	// append their task refs in a single collaborative transaction.
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { ActionResult } from '@sveltejs/kit';
	import Modal from '../Modal.svelte';
	import Icon from '../Icon.svelte';
	import Button from '../Button.svelte';
	import TaskPropertyRail from './TaskPropertyRail.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import type { PriorityId, ProjectId, StatusId, TypeId } from '$lib/types';
	import { m } from '$lib/paraglide/messages';

	type AssignableUser = {
		id: string;
		name: string;
		email: string;
		initials: string;
		color: string;
		status: 'active' | 'invited' | 'disabled';
	};
	type PickableProject = {
		id: string;
		key: string;
		name: string;
		color: string;
		icon: string;
		status: string;
	};

	/** A source todo as resolved from the editor. */
	export type SourceTodo = { pos: number; text: string };
	/** Mapping returned to the caller for each task that was created. */
	export type CreatedTodo = { pos: number; displayId: string };

	interface Props {
		open: boolean;
		todos: SourceTodo[];
		defaultProjectKey?: string;
		projects: PickableProject[];
		users: AssignableUser[];
		currentUserId?: string;
		memberProjectIds?: string[];
		allAccess?: boolean;
		onclose: () => void;
		oncreated?: (created: CreatedTodo[]) => void;
	}

	let {
		open,
		todos,
		defaultProjectKey,
		projects,
		users,
		currentUserId,
		memberProjectIds = [],
		allAccess = false,
		onclose,
		oncreated
	}: Props = $props();

	type Draft = {
		pos: number;
		title: string;
		description: string;
		project: ProjectId | '';
		type: TypeId;
		status: StatusId;
		priority: PriorityId;
		assignees: string[];
		due: string | null;
		estimate: number | undefined;
		tags: string[];
		include: boolean;
		created: boolean;
		error: string;
	};

	let drafts = $state<Draft[]>([]);
	let index = $state(0);
	let creating = $state(false);

	const meId = $derived(currentUserId ?? '');

	$effect(() => {
		if (!open) return;
		drafts = todos.map((t) => ({
			pos: t.pos,
			title: t.text,
			description: '',
			project: (defaultProjectKey as ProjectId | undefined) ?? '',
			type: 'task' as TypeId,
			status: 'todo' as StatusId,
			priority: 'medium' as PriorityId,
			assignees: meId ? [meId] : [],
			due: null,
			estimate: undefined,
			tags: [],
			include: true,
			created: false,
			error: ''
		}));
		index = 0;
		creating = false;
	});

	const current = $derived(drafts[index]);
	const total = $derived(drafts.length);
	// Drafts that will actually be created on "Create all".
	const creatable = $derived(
		drafts.filter((d) => d.include && !d.created && !!d.project && !!d.title.trim())
	);
	const allDone = $derived(total > 0 && drafts.every((d) => d.created || !d.include));

	function go(to: number) {
		index = Math.max(0, Math.min(total - 1, to));
	}

	async function createAll() {
		if (creating) return;
		creating = true;
		const created: CreatedTodo[] = [];
		let failed = 0;
		for (const d of drafts) {
			if (!d.include || d.created) continue;
			if (!d.project || !d.title.trim()) {
				d.error = m.notes_bulk_need_project();
				failed++;
				continue;
			}
			const fd = new FormData();
			fd.set('title', d.title.trim());
			fd.set('description', d.description);
			fd.set('project', d.project);
			fd.set('type', d.type);
			fd.set('status', d.status);
			fd.set('priority', d.priority);
			fd.set('due', d.due ?? '');
			fd.set('estimate', d.estimate != null ? String(d.estimate) : '');
			for (const a of d.assignees) fd.append('assignees', a);
			for (const t of d.tags) fd.append('tags', t);

			try {
				const res = await fetch('/tasks?/create', {
					method: 'POST',
					body: fd,
					headers: { 'x-sveltekit-action': 'true' }
				});
				const result = deserialize(await res.text()) as ActionResult<
					{ displayId?: string },
					{ message?: string }
				>;
				if (result.type === 'success') {
					d.created = true;
					d.error = '';
					created.push({ pos: d.pos, displayId: result.data?.displayId ?? '' });
				} else {
					d.error =
						result.type === 'failure'
							? (result.data?.message ?? m.tasks_failed_to_create())
							: m.tasks_failed_to_create();
					failed++;
				}
			} catch {
				d.error = m.tasks_failed_to_create();
				failed++;
			}
		}
		creating = false;

		if (created.length) {
			await invalidateAll();
			oncreated?.(created);
		}
		if (!failed) {
			showToast('ok', m.notes_bulk_created({ n: created.length }));
			onclose();
		} else {
			if (created.length) showToast('ok', m.notes_bulk_partial({ ok: created.length, failed }));
			// Land on the first draft that still needs attention.
			const stuck = drafts.findIndex((d) => d.include && !d.created);
			if (stuck >= 0) index = stuck;
		}
	}

	function handleKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onclose();
			return;
		}
		// Don't hijack arrow keys while the user is editing a field — let the
		// caret move normally. Only step between todos from "chrome" focus.
		const el = e.target as HTMLElement | null;
		const typing =
			!!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
		if (typing || creating) return;
		if (e.key === 'ArrowLeft') go(index - 1);
		else if (e.key === 'ArrowRight') go(index + 1);
	}
</script>

<svelte:window onkeydown={open ? handleKey : undefined} />

<Modal {open} {onclose} maxWidth={640}>
	{#if current}
		<!-- Head -->
		<div class="flex items-center gap-2 border-b border-border px-5 pt-4 pb-3">
			<Icon name="check-square" size={15} class="text-text-2" />
			<div class="text-[13px] font-medium text-text">{m.notes_bulk_title()}</div>
			<span class="font-mono text-[11px] text-text-3">{index + 1} / {total}</span>
			<button
				type="button"
				onclick={onclose}
				class="ml-auto grid h-8 w-8 place-items-center rounded-lg text-text-3 transition-colors hover:bg-surface hover:text-text"
				aria-label={m.common_close()}
			>
				<Icon name="x" size={14} />
			</button>
		</div>

		<!-- Stepper controls -->
		<div class="flex items-center gap-2 px-5 pt-3">
			<button
				type="button"
				onclick={() => go(index - 1)}
				disabled={index === 0 || creating}
				class="grid h-7 w-7 place-items-center rounded-lg border border-border text-text-2 transition-colors hover:border-border-strong hover:text-text disabled:pointer-events-none disabled:opacity-40"
				aria-label={m.notes_bulk_prev()}
			>
				<Icon name="chevron" size={14} class="rotate-90" />
			</button>
			<button
				type="button"
				onclick={() => go(index + 1)}
				disabled={index >= total - 1 || creating}
				class="grid h-7 w-7 place-items-center rounded-lg border border-border text-text-2 transition-colors hover:border-border-strong hover:text-text disabled:pointer-events-none disabled:opacity-40"
				aria-label={m.notes_bulk_next()}
			>
				<Icon name="chevron" size={14} class="-rotate-90" />
			</button>

			<label
				class="ml-auto inline-flex cursor-pointer items-center gap-2 text-[12.5px] select-none {current.created
					? 'pointer-events-none opacity-50'
					: ''}"
			>
				<input type="checkbox" bind:checked={current.include} class="accent-accent" />
				<span class="text-text-2">{m.notes_bulk_include()}</span>
			</label>
		</div>

		<!-- Body: the current draft -->
		<div class="px-5 pt-3 pb-3 {current.include ? '' : 'opacity-50'}">
			<input
				type="text"
				bind:value={current.title}
				disabled={current.created}
				placeholder={m.tasks_title_placeholder()}
				class="mb-2 w-full border-0 bg-transparent text-[19px] font-semibold tracking-[-0.01em] text-text outline-none placeholder:text-text-3 disabled:text-text-3"
			/>
			<textarea
				bind:value={current.description}
				disabled={current.created}
				placeholder={m.tasks_description_placeholder()}
				rows="2"
				class="w-full resize-none border-0 bg-transparent text-[13.5px] leading-relaxed text-text-2 outline-none placeholder:text-text-3"
			></textarea>

			<div class="mt-3">
				<TaskPropertyRail
					bind:project={current.project}
					bind:type={current.type}
					bind:status={current.status}
					bind:priority={current.priority}
					bind:assignees={current.assignees}
					bind:due={current.due}
					bind:estimate={current.estimate}
					bind:tags={current.tags}
					{projects}
					{users}
					{memberProjectIds}
					{allAccess}
				/>
			</div>

			{#if current.created}
				<div class="mt-3 inline-flex items-center gap-1.5 text-[12px] text-accent">
					<Icon name="check" size={13} />
					{m.notes_bulk_created_badge()}
				</div>
			{:else if current.error}
				<div class="mt-3 text-[12px] text-accent">{current.error}</div>
			{/if}
		</div>

		<!-- Progress dots -->
		<div class="flex flex-wrap items-center gap-1.5 px-5 pb-3">
			{#each drafts as d, i (d.pos)}
				<button
					type="button"
					onclick={() => go(i)}
					aria-label={`${i + 1}`}
					title={d.title}
					class="h-2.5 w-2.5 rounded-full transition-colors {d.created
						? 'bg-accent'
						: !d.include
							? 'bg-border'
							: 'bg-text-3 hover:bg-text-2'} {i === index ? 'ring-2 ring-accent/40' : ''}"
				></button>
			{/each}
		</div>

		<!-- Foot -->
		<div class="flex items-center gap-2 rounded-b-2xl border-t border-border bg-bg/40 px-5 py-3">
			<Button variant="default" onclick={onclose}>{m.common_cancel()}</Button>
			<div class="ml-auto">
				<Button
					variant="primary"
					onclick={createAll}
					disabled={creating || creatable.length === 0 || allDone}
				>
					{creating ? m.common_creating() : m.notes_bulk_create_all({ n: creatable.length })}
				</Button>
			</div>
		</div>
	{/if}
</Modal>
