<script lang="ts">
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Button from '$lib/components/Button.svelte';
	import IconButton from '$lib/components/IconButton.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import StatusDot from '$lib/components/StatusDot.svelte';
	import PriorityBars from '$lib/components/PriorityBars.svelte';
	import Inspector from '$lib/components/tasks/Inspector.svelte';
	import CreateTaskModal from '$lib/components/tasks/CreateTaskModal.svelte';
	import EditProjectModal from '$lib/components/projects/EditProjectModal.svelte';
	import ProjectHistory from '$lib/components/projects/ProjectHistory.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { PROJECT_STATUS, TRACKR_STATUSES, formatDateShort } from '$lib/data';
	import { resolveUser } from '$lib/lookup.svelte';
	import { confirm as uiConfirm } from '$lib/components/confirm.svelte';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { autoPlace } from '$lib/actions/autoPlace';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/motion';
	import { goto, invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import { showToast } from '$lib/toast.svelte';
	import type { ActionResult } from '@sveltejs/kit';
	import type { ProjectId, Task } from '$lib/types';
	import type { PageData } from './$types';

	type LayoutShape = {
		users?: { id: string; name: string; email: string; initials: string; color: string }[];
	};

	let { data }: { data: PageData } = $props();

	const p = $derived(data.project);
	const st = $derived(
		PROJECT_STATUS[p.status as keyof typeof PROJECT_STATUS] ?? PROJECT_STATUS.active
	);

	// Tasks come from the DB load (same Task shape as the /tasks page).
	const tasks = $derived(data.tasks);

	const total = $derived(tasks.length);
	const active = $derived(
		tasks.filter((t) => t.status === 'in_progress' || t.status === 'paused').length
	);
	const done = $derived(
		tasks.filter((t) => t.status === 'done' || t.status === 'in_review').length
	);
	const pct = $derived(total === 0 ? 0 : Math.round((done / total) * 100));

	const groups = $derived(
		TRACKR_STATUSES.map((s) => ({
			...s,
			tasks: tasks.filter((t) => t.status === s.id)
		})).filter((g) => g.tasks.length > 0)
	);

	function relativeTime(d: Date): string {
		const ms = Date.now() - d.getTime();
		const m = Math.round(ms / 60_000);
		if (m < 1) return 'just now';
		if (m < 60) return `${m} min ago`;
		const h = Math.round(m / 60);
		if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
		const days = Math.round(h / 24);
		if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
		return d.toISOString().slice(0, 10);
	}

	let selectedId = $state<string | null>(null);
	let selected = $derived(selectedId ? data.tasks.find((t) => t.id === selectedId) ?? null : null);
	let creating = $state(false);

	let addingMember = $state(false);
	let memberSearch = $state('');
	let busy = $state<string | null>(null);
	let openMemberMenu = $state<string | null>(null);

	let settingsOpen = $state(false);
	let editing = $state(false);
	let historyOpen = $state(false);
	let projectBusy = $state<'archive' | 'unarchive' | 'delete' | 'favoriteAdd' | 'favoriteRemove' | null>(null);

	type LayoutFav = { favoriteProjectIds?: string[] };
	const isFavorite = $derived(
		((data as unknown as LayoutFav).favoriteProjectIds ?? []).includes(p.id)
	);

	async function postProject(
		action: 'archive' | 'unarchive' | 'delete' | 'favoriteAdd' | 'favoriteRemove'
	): Promise<boolean> {
		projectBusy = action;
		try {
			const res = await fetch(`?/${action}`, {
				method: 'POST',
				body: new FormData(),
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result: ActionResult = deserialize(await res.text());
			return result.type === 'success';
		} catch {
			return false;
		} finally {
			projectBusy = null;
		}
	}

	async function toggleFavorite() {
		settingsOpen = false;
		const success = await postProject(isFavorite ? 'favoriteRemove' : 'favoriteAdd');
		if (success) await invalidateAll();
	}

	async function archiveProject() {
		settingsOpen = false;
		const ok = await uiConfirm({
			title: 'Archive project',
			message: `"${p.name}" will be hidden from active lists. Its tasks stay where they are.`,
			confirmLabel: 'Archive',
			tone: 'warn'
		});
		if (!ok) return;
		const success = await postProject('archive');
		if (success) await invalidateAll();
	}

	async function unarchiveProject() {
		settingsOpen = false;
		const success = await postProject('unarchive');
		if (success) await invalidateAll();
	}

	async function deleteProject() {
		settingsOpen = false;
		const ok = await uiConfirm({
			title: 'Delete project',
			message: `"${p.name}" and all its tasks, comments, time logs, and assignments will be permanently removed. This cannot be undone.`,
			confirmLabel: 'Delete project',
			tone: 'danger'
		});
		if (!ok) return;
		const success = await postProject('delete');
		if (success) await goto('/projects');
	}

	const layoutUsers = $derived((data as unknown as LayoutShape).users ?? []);
	const memberIds = $derived(new Set(data.members.map((m) => m.id)));
	const candidates = $derived.by(() => {
		const q = memberSearch.toLowerCase();
		return layoutUsers
			.filter((u) => !memberIds.has(u.id))
			.filter((u) =>
				q ? u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) : true
			);
	});

	async function postMember(
		action: 'memberAdd' | 'memberRemove' | 'leadSet' | 'memberSetRole',
		userId: string,
		extra?: Record<string, string>
	): Promise<boolean> {
		busy = `${action}:${userId}`;
		const fd = new FormData();
		fd.append('userId', userId);
		if (action === 'memberAdd') fd.append('role', 'project.member');
		for (const [k, v] of Object.entries(extra ?? {})) fd.append(k, v);
		try {
			const res = await fetch(`?/${action}`, {
				method: 'POST',
				body: fd,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result: ActionResult = deserialize(await res.text());
			if (result.type === 'success') {
				await invalidateAll();
				return true;
			}
			const msg =
				result.type === 'failure'
					? (result.data as { message?: string } | undefined)?.message ?? 'Action failed.'
					: result.type === 'error'
						? result.error?.message ?? 'Action failed.'
						: 'Action failed.';
			showToast('err', msg);
		} catch {
			showToast('err', 'Network error.');
		} finally {
			busy = null;
		}
		return false;
	}

	async function addMember(userId: string) {
		const ok = await postMember('memberAdd', userId);
		if (ok) {
			memberSearch = '';
			addingMember = false;
		}
	}

	async function setLead(userId: string) {
		openMemberMenu = null;
		await postMember('leadSet', userId);
	}

	async function clearLead() {
		openMemberMenu = null;
		await postMember('leadSet', '');
	}

	const PROJECT_ROLES = [
		{ id: 'project.manager', label: 'Manager', color: '#ef7a6d' },
		{ id: 'project.member', label: 'Member', color: '#7a9cf0' },
		{ id: 'project.viewer', label: 'Viewer', color: '#9aa4b2' }
	] as const;

	async function setRole(userId: string, role: string) {
		openMemberMenu = null;
		await postMember('memberSetRole', userId, { role });
	}

	async function removeMember(userId: string, name: string) {
		openMemberMenu = null;
		const isLead = userId === p.leadId;
		const ok = await uiConfirm({
			title: 'Remove member',
			message: isLead
				? `${name} is currently the project lead. Removing them will also clear the lead.`
				: `${name} will no longer be a member of ${p.name}.`,
			confirmLabel: 'Remove',
			tone: isLead ? 'warn' : 'danger'
		});
		if (!ok) return;
		await postMember('memberRemove', userId);
	}
</script>

<svelte:head><title>Trackr · {p.name}</title></svelte:head>

<Topbar
	crumbs={[
		{ label: 'Trackr Workspace', href: '/tasks' },
		{ label: 'Projects', href: '/projects' },
		{ label: p.name }
	]}
/>

<div class="flex-1 min-h-0 overflow-y-auto">
	<div class="px-6 py-6">
		<a
			href="/projects"
			class="inline-flex items-center gap-1.5 text-[12.5px] text-text-3 hover:text-text mb-5"
		>
			<Icon name="chevron-r" size={11} class="rotate-180" /> Projects
		</a>

		<!-- hero -->
		<div class="flex items-start gap-4 mb-5">
			<div
				class="w-12 h-12 rounded-xl grid place-items-center text-white font-semibold text-[20px] shrink-0"
				style:background="linear-gradient(140deg, {p.color}, color-mix(in oklch, {p.color} 70%, #000) 85%)"
				style:box-shadow="0 1px 0 rgba(255,255,255,0.18) inset"
			>{p.icon}</div>
			<div class="flex-1 min-w-0">
				<div class="flex items-center gap-2">
					<h1 class="text-[26px] font-semibold tracking-[-0.014em] text-text">{p.name}</h1>
				</div>
				<div class="flex items-center gap-2 mt-1.5 text-[12.5px] text-text-3">
					<span
						class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11.5px]"
						style:background={st.color + '24'}
						style:color={st.color}
					>
						<span class="w-1.5 h-1.5 rounded-full" style:background={st.color}></span>
						{st.label}
					</span>
					<span class="text-text-4">·</span>
					<span class="font-mono">{p.key}</span>
					{#if data.org}
						<span class="text-text-4">·</span>
						<span>{data.org.name}</span>
					{/if}
					<span class="text-text-4">·</span>
					<span>Updated {relativeTime(p.updatedAt)}</span>
				</div>
			</div>
			<div class="flex items-center gap-2">
				<IconButton ariaLabel="History" onclick={() => (historyOpen = true)}>
					<Icon name="logs" size={14} />
				</IconButton>
				<IconButton ariaLabel="Share"><Icon name="link" size={14} /></IconButton>
				<div class="relative">
					<IconButton
						ariaLabel="Settings"
						onclick={() => (settingsOpen = !settingsOpen)}
					>
						<Icon name="settings" size={14} />
					</IconButton>
					{#if settingsOpen}
						<div
							use:clickOutside={() => (settingsOpen = false)}
							use:autoPlace
							in:fly={POPOVER_IN}
							class="absolute top-full mt-1.5 z-50 bg-bg-elev border border-border rounded-[10px] p-1.5 min-w-[200px]"
							style:box-shadow="var(--shadow-lg)"
						>
							<button
								type="button"
								onclick={() => {
									settingsOpen = false;
									editing = true;
								}}
								class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-[12.5px] text-text-2 hover:text-text"
							>
								<Icon name="settings" size={12} /> Edit details
							</button>
							<div class="my-1 border-t border-border/60"></div>
							<button
								type="button"
								onclick={toggleFavorite}
								disabled={projectBusy !== null}
								class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-[12.5px] text-text-2 hover:text-text disabled:opacity-50"
							>
								<span class={isFavorite ? 'text-accent' : ''}>
									<Icon name="star" size={12} />
								</span>
								{#if projectBusy === 'favoriteAdd' || projectBusy === 'favoriteRemove'}
									Saving…
								{:else if isFavorite}
									Remove from favorites
								{:else}
									Add to favorites
								{/if}
							</button>
							<div class="my-1 border-t border-border/60"></div>
							{#if p.status === 'archived'}
								<button
									type="button"
									onclick={unarchiveProject}
									disabled={projectBusy !== null}
									class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-[12.5px] text-text-2 hover:text-text disabled:opacity-50"
								>
									<Icon name="refresh" size={12} />
									{projectBusy === 'unarchive' ? 'Unarchiving…' : 'Unarchive project'}
								</button>
							{:else}
								<button
									type="button"
									onclick={archiveProject}
									disabled={projectBusy !== null}
									class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-[12.5px] text-text-2 hover:text-text disabled:opacity-50"
								>
									<Icon name="bookmark" size={12} />
									{projectBusy === 'archive' ? 'Archiving…' : 'Archive project'}
								</button>
							{/if}
							<div class="my-1 border-t border-border/60"></div>
							<button
								type="button"
								onclick={deleteProject}
								disabled={projectBusy !== null}
								class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-[12.5px] disabled:opacity-50"
								style:color="#ef7a6d"
							>
								<Icon name="x" size={12} />
								{projectBusy === 'delete' ? 'Deleting…' : 'Delete project'}
							</button>
						</div>
					{/if}
				</div>
				<Button variant="primary" size="sm" onclick={() => (creating = true)}>
					<Icon name="plus" size={13} /> New task
				</Button>
			</div>
		</div>

		<!-- summary + members -->
		<div class="grid gap-5 mb-6" style:grid-template-columns="1fr 1fr">
			<div class="bg-bg-elev border border-border rounded-2xl p-4">
				<div class="text-[11px] uppercase tracking-[0.08em] text-text-4 mb-1.5">About</div>
				<p class="text-[13.5px] text-text-2 leading-relaxed">
					{p.description ?? 'No description yet.'}
				</p>
			</div>
			<div class="bg-bg-elev border border-border rounded-2xl p-4 relative">
				<div class="text-[11px] uppercase tracking-[0.08em] text-text-4 mb-2.5">
					Members · {data.members.length}
				</div>
				<div class="flex flex-wrap gap-1.5">
					{#each data.members as m (m.id)}
						<div class="relative">
							<button
								type="button"
								onclick={() => (openMemberMenu = openMemberMenu === m.id ? null : m.id)}
								class="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-surface border border-border text-[12px] hover:border-border-strong transition-colors"
							>
								<Avatar user={m} size={18} />
								<span class="text-text">{m.name.split(' ')[0]}</span>
								{#if m.id === p.leadId}
									<span
										class="text-[10px] uppercase tracking-[0.06em] px-1.5 py-0.5 rounded text-accent"
										style:background="rgba(239,122,109,0.14)"
									>
										Lead
									</span>
								{/if}
							</button>
							{#if openMemberMenu === m.id}
								<div
									use:clickOutside={() => (openMemberMenu = null)}
									use:autoPlace
									in:fly={POPOVER_IN}
									class="absolute top-full mt-1.5 z-40 bg-bg-elev border border-border rounded-[10px] p-1.5 min-w-[200px]"
									style:box-shadow="var(--shadow-lg)"
								>
									<div class="px-2 pt-1 pb-1 text-[10.5px] uppercase tracking-[0.08em] text-text-4">
										Role
									</div>
									{#each PROJECT_ROLES as r (r.id)}
										{@const active = m.role === r.id}
										<button
											type="button"
											onclick={() => setRole(m.id, r.id)}
											disabled={busy === `memberSetRole:${m.id}` || active}
											class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-[12.5px] text-text-2 hover:text-text disabled:opacity-100 disabled:cursor-default"
										>
											<span class="w-1.5 h-1.5 rounded-full" style:background={r.color}></span>
											<span class={active ? 'text-text font-medium' : ''}>{r.label}</span>
											{#if active}
												<span class="ml-auto text-text-3"><Icon name="check" size={12} /></span>
											{/if}
										</button>
									{/each}
									<div class="my-1 border-t border-border/60"></div>
									{#if m.id === p.leadId}
										<button
											type="button"
											onclick={clearLead}
											disabled={busy === 'leadSet:'}
											class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-[12.5px] text-text-2 hover:text-text disabled:opacity-50"
										>
											<Icon name="star" size={12} /> Remove as lead
										</button>
									{:else}
										<button
											type="button"
											onclick={() => setLead(m.id)}
											disabled={busy === `leadSet:${m.id}`}
											class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-[12.5px] text-text-2 hover:text-text disabled:opacity-50"
										>
											<Icon name="star" size={12} /> Set as lead
										</button>
									{/if}
									<div class="my-1 border-t border-border/60"></div>
									<button
										type="button"
										onclick={() => removeMember(m.id, m.name)}
										disabled={busy === `memberRemove:${m.id}`}
										class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-[12.5px] text-text-2 hover:text-text disabled:opacity-50"
									>
										<Icon name="x" size={12} /> Remove
									</button>
								</div>
							{/if}
						</div>
					{/each}

					<div class="relative">
						<button
							type="button"
							onclick={() => {
								addingMember = !addingMember;
								memberSearch = '';
							}}
							class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-border text-[12px] text-text-3 hover:text-text hover:border-border-strong transition-colors"
						>
							<Icon name="plus" size={11} /> Add
						</button>
						{#if addingMember}
							<div
								use:clickOutside={() => (addingMember = false)}
								use:autoPlace
								in:fly={POPOVER_IN}
								class="absolute top-full mt-1.5 z-50 bg-bg-elev border border-border rounded-[10px] p-1.5 w-[280px]"
								style:box-shadow="var(--shadow-lg)"
							>
								<div class="flex items-center gap-2 px-2 pt-1 pb-2 border-b border-border mb-1.5">
									<span class="text-text-3"><Icon name="search" size={13} /></span>
									<input
										type="text"
										bind:value={memberSearch}
										placeholder="Add a teammate…"
										class="flex-1 bg-transparent border-0 outline-none text-[13px] placeholder:text-text-3"
									/>
								</div>
								<div class="max-h-[280px] overflow-y-auto">
									{#each candidates as u (u.id)}
										<button
											type="button"
											onclick={() => addMember(u.id)}
											disabled={busy === `memberAdd:${u.id}`}
											class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text disabled:opacity-50"
										>
											<Avatar user={u} size={22} />
											<span class="min-w-0 flex-1">
												<span class="block text-[13px] truncate">{u.name}</span>
												<span class="block text-[11px] text-text-3 truncate font-mono"
													>{u.email}</span
												>
											</span>
										</button>
									{/each}
									{#if candidates.length === 0}
										<div class="px-2 py-3 text-center text-[12px] text-text-3">
											{memberSearch ? 'No matches.' : 'Everyone is already a member.'}
										</div>
									{/if}
								</div>
							</div>
						{/if}
					</div>
				</div>

			</div>
		</div>

		<!-- stats -->
		<div class="grid grid-cols-4 gap-3 mb-7">
			<div class="bg-bg-elev border border-border rounded-2xl p-4">
				<div class="text-[11px] uppercase tracking-[0.08em] text-text-4">Total tasks</div>
				<div class="font-mono text-[24px] font-semibold mt-1.5">{total}</div>
			</div>
			<div class="bg-bg-elev border border-border rounded-2xl p-4">
				<div class="text-[11px] uppercase tracking-[0.08em] text-text-4">In progress</div>
				<div class="font-mono text-[24px] font-semibold mt-1.5 text-[#f0a85c]">{active}</div>
			</div>
			<div class="bg-bg-elev border border-border rounded-2xl p-4">
				<div class="text-[11px] uppercase tracking-[0.08em] text-text-4">Completed</div>
				<div class="font-mono text-[24px] font-semibold mt-1.5 text-[#7fc8a9]">{done}</div>
			</div>
			<div class="bg-bg-elev border border-border rounded-2xl p-4">
				<div class="text-[11px] uppercase tracking-[0.08em] text-text-4 mb-1.5">Progress</div>
				<div class="font-mono text-[24px] font-semibold mb-2">
					{pct}<span class="text-text-3 text-[14px]">%</span>
				</div>
				<div class="h-1.5 rounded-full bg-surface overflow-hidden">
					<div class="h-full" style:width="{pct}%" style:background={p.color}></div>
				</div>
			</div>
		</div>

		<!-- tasks -->
		<div class="bg-bg-elev border border-border rounded-2xl overflow-hidden">
			<div class="flex items-center gap-2.5 px-4 py-3 border-b border-border">
				<span class="text-[14px] font-semibold">Tasks</span>
				<span class="font-mono text-[11px] text-text-3">{tasks.length}</span>
			</div>
			{#if tasks.length === 0}
				<EmptyState
					icon="check-square"
					title="No tasks yet"
					hint="Click New task to get started — tasks created here will show up on the /tasks page."
				/>
			{:else}
				{#each groups as g (g.id)}
					<div class="flex items-center gap-2 px-4 py-2 bg-surface/30 border-b border-border">
						<span class="w-2 h-2 rounded-full" style:background={g.dot}></span>
						<span class="text-[12px] font-semibold text-text">{g.label}</span>
						<span class="font-mono text-[11px] text-text-3">{g.tasks.length}</span>
					</div>
					{#each g.tasks as t (t.id)}
						<button
							type="button"
							onclick={() => (selectedId = t.id)}
							class="w-full flex items-center gap-3 px-4 py-2.5 border-b border-border/40 hover:bg-[var(--row-hover)] transition-colors text-left"
						>
							<StatusDot status={t.status} />
							<span class="font-mono text-[11.5px] text-text-3 w-[78px] shrink-0">{t.id}</span>
							<span class="text-[13px] text-text truncate flex-1">{t.title}</span>
							{#if t.priority !== 'none'}<PriorityBars priority={t.priority} />{/if}
							<span class="font-mono text-[11px] text-text-3 w-16 text-right">
								{#if t.endDate}{formatDateShort(t.endDate)}{:else if t.due}{formatDateShort(t.due)}{:else}—{/if}
							</span>
							<Avatar user={resolveUser(t.assignee)} size={20} />
						</button>
					{/each}
				{/each}
			{/if}
		</div>
	</div>
</div>

<EditProjectModal
	open={editing}
	onclose={() => (editing = false)}
	project={{
		key: p.key,
		name: p.name,
		description: p.description,
		color: p.color,
		status: p.status
	}}
/>

<Inspector task={selected} onclose={() => (selectedId = null)} users={data.users} />

<ProjectHistory
	open={historyOpen}
	onclose={() => (historyOpen = false)}
	activity={data.activity}
	taskIds={data.tasks.map((t) => t.id)}
	onOpenTask={(ref) => {
		historyOpen = false;
		selectedId = ref;
	}}
/>

<CreateTaskModal
	open={creating}
	prefill={{ project: p.key as ProjectId }}
	onclose={() => (creating = false)}
	users={data.users}
	projects={data.projects}
	currentUserId={data.currentUserId}
/>
