<script lang="ts">
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Button from '$lib/components/Button.svelte';
	import IconButton from '$lib/components/IconButton.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Inspector from '$lib/components/tasks/Inspector.svelte';
	import TaskRow from '$lib/components/tasks/TaskRow.svelte';
	import CreateTaskModal from '$lib/components/tasks/CreateTaskModal.svelte';
	import EditProjectModal from '$lib/components/projects/EditProjectModal.svelte';
	import ProjectHistory from '$lib/components/projects/ProjectHistory.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { PROJECT_STATUS, TRACKR_STATUSES } from '$lib/config/taxonomy';
	import { projectStatusLabel, statusLabel } from '$lib/utils/labels';
	import { m } from '$lib/paraglide/messages';
	import { confirm as uiConfirm } from '$lib/components/confirm.svelte';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { autoPlace } from '$lib/actions/autoPlace';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/config/motion';
	import { goto, invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import { showToast } from '$lib/stores/toast.svelte';
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
		const mins = Math.round(ms / 60_000);
		if (mins < 1) return m.projects_just_now();
		if (mins < 60) return m.projects_min_ago({ n: mins });
		const h = Math.round(mins / 60);
		if (h < 24)
			return h === 1 ? m.projects_hour_ago_one({ n: h }) : m.projects_hours_ago_other({ n: h });
		const days = Math.round(h / 24);
		if (days < 7)
			return days === 1
				? m.projects_day_ago_one({ n: days })
				: m.projects_days_ago_other({ n: days });
		return d.toISOString().slice(0, 10);
	}

	let selectedId = $state<string | null>(null);
	let selected = $derived(
		selectedId ? (data.tasks.find((t) => t.id === selectedId) ?? null) : null
	);
	let creating = $state(false);

	let addingMember = $state(false);
	let memberSearch = $state('');
	let busy = $state<string | null>(null);
	let openMemberMenu = $state<string | null>(null);

	let settingsOpen = $state(false);
	let editing = $state(false);
	let historyOpen = $state(false);
	let projectBusy = $state<
		'archive' | 'unarchive' | 'delete' | 'favoriteAdd' | 'favoriteRemove' | null
	>(null);

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
			title: m.projects_archive_confirm_title(),
			message: m.projects_archive_confirm_message({ name: p.name }),
			confirmLabel: m.projects_archive_confirm_label(),
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
			title: m.projects_delete_confirm_title(),
			message: m.projects_delete_confirm_message({ name: p.name }),
			confirmLabel: m.projects_delete_project(),
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
					? ((result.data as { message?: string } | undefined)?.message ??
						m.projects_action_failed())
					: result.type === 'error'
						? (result.error?.message ?? m.projects_action_failed())
						: m.projects_action_failed();
			showToast('err', msg);
		} catch {
			showToast('err', m.projects_network_error());
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

	const PROJECT_ROLES = $derived([
		{ id: 'project.manager', label: m.projects_role_manager(), color: '#ef7a6d' },
		{ id: 'project.member', label: m.projects_role_member(), color: '#7a9cf0' },
		{ id: 'project.viewer', label: m.projects_role_viewer(), color: '#9aa4b2' }
	] as const);

	async function setRole(userId: string, role: string) {
		openMemberMenu = null;
		await postMember('memberSetRole', userId, { role });
	}

	async function removeMember(userId: string, name: string) {
		openMemberMenu = null;
		const isLead = userId === p.leadId;
		const ok = await uiConfirm({
			title: m.projects_remove_member_title(),
			message: isLead
				? m.projects_remove_member_lead_message({ name })
				: m.projects_remove_member_message({ name, project: p.name }),
			confirmLabel: m.common_remove(),
			tone: isLead ? 'warn' : 'danger'
		});
		if (!ok) return;
		await postMember('memberRemove', userId);
	}
</script>

<svelte:head><title>{m.projects_detail_title({ name: p.name })}</title></svelte:head>

<Topbar
	crumbs={[
		{ label: m.projects_breadcrumb_workspace(), href: '/tasks' },
		{ label: m.projects_breadcrumb_projects(), href: '/projects' },
		{ label: p.name }
	]}
/>

<div class="min-h-0 flex-1 overflow-y-auto">
	<div class="px-6 py-6">
		<a
			href="/projects"
			class="mb-5 inline-flex items-center gap-1.5 text-[12.5px] text-text-3 hover:text-text"
		>
			<Icon name="chevron-r" size={11} class="rotate-180" />
			{m.projects_back_to_projects()}
		</a>

		<!-- hero -->
		<div class="mb-5 flex items-start gap-4">
			<div
				class="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-[20px] font-semibold text-white shadow-edge"
				style:background="linear-gradient(140deg, {p.color}, color-mix(in oklch, {p.color} 70%, #000)
				85%)"
			>
				{p.icon}
			</div>
			<div class="min-w-0 flex-1">
				<div class="flex items-center gap-2">
					<h1 class="text-[26px] font-semibold tracking-[-0.014em] text-text">{p.name}</h1>
				</div>
				<div class="mt-1.5 flex items-center gap-2 text-[12.5px] text-text-3">
					<span
						class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px]"
						style:background={st.color + '24'}
						style:color={st.color}
					>
						<span class="h-1.5 w-1.5 rounded-full" style:background={st.color}></span>
						{projectStatusLabel(p.status)}
					</span>
					<span class="text-text-4">·</span>
					<span class="font-mono">{p.key}</span>
					{#if data.org}
						<span class="text-text-4">·</span>
						<span>{data.org.name}</span>
					{/if}
					<span class="text-text-4">·</span>
					<span>{m.projects_updated_relative({ time: relativeTime(p.updatedAt) })}</span>
				</div>
			</div>
			<div class="flex items-center gap-2">
				<IconButton ariaLabel={m.projects_aria_history()} onclick={() => (historyOpen = true)}>
					<Icon name="logs" size={14} />
				</IconButton>
				<IconButton ariaLabel={m.projects_aria_share()}><Icon name="link" size={14} /></IconButton>
				<div class="relative">
					<IconButton
						ariaLabel={m.projects_aria_settings()}
						onclick={() => (settingsOpen = !settingsOpen)}
					>
						<Icon name="settings" size={14} />
					</IconButton>
					{#if settingsOpen}
						<div
							use:clickOutside={() => (settingsOpen = false)}
							use:autoPlace
							in:fly={POPOVER_IN}
							class="absolute top-full z-50 mt-1.5 min-w-[200px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
						>
							<button
								type="button"
								onclick={() => {
									settingsOpen = false;
									editing = true;
								}}
								class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-text-2 hover:bg-surface-2 hover:text-text"
							>
								<Icon name="settings" size={12} />
								{m.projects_edit_details()}
							</button>
							<div class="my-1 border-t border-border/60"></div>
							<button
								type="button"
								onclick={toggleFavorite}
								disabled={projectBusy !== null}
								class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-text-2 hover:bg-surface-2 hover:text-text disabled:opacity-50"
							>
								<span class={isFavorite ? 'text-accent' : ''}>
									<Icon name="star" size={12} />
								</span>
								{#if projectBusy === 'favoriteAdd' || projectBusy === 'favoriteRemove'}
									{m.common_saving()}
								{:else if isFavorite}
									{m.projects_remove_from_favorites()}
								{:else}
									{m.projects_add_to_favorites()}
								{/if}
							</button>
							<div class="my-1 border-t border-border/60"></div>
							{#if p.status === 'archived'}
								<button
									type="button"
									onclick={unarchiveProject}
									disabled={projectBusy !== null}
									class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-text-2 hover:bg-surface-2 hover:text-text disabled:opacity-50"
								>
									<Icon name="refresh" size={12} />
									{projectBusy === 'unarchive'
										? m.projects_unarchiving()
										: m.projects_unarchive_project()}
								</button>
							{:else}
								<button
									type="button"
									onclick={archiveProject}
									disabled={projectBusy !== null}
									class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-text-2 hover:bg-surface-2 hover:text-text disabled:opacity-50"
								>
									<Icon name="bookmark" size={12} />
									{projectBusy === 'archive'
										? m.projects_archiving()
										: m.projects_archive_project()}
								</button>
							{/if}
							<div class="my-1 border-t border-border/60"></div>
							<button
								type="button"
								onclick={deleteProject}
								disabled={projectBusy !== null}
								class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-surface-2 disabled:opacity-50 text-accent"
							>
								<Icon name="x" size={12} />
								{projectBusy === 'delete' ? m.common_deleting() : m.projects_delete_project()}
							</button>
						</div>
					{/if}
				</div>
				<Button variant="primary" size="sm" onclick={() => (creating = true)}>
					<Icon name="plus" size={13} />
					{m.projects_new_task()}
				</Button>
			</div>
		</div>

		<!-- summary + members -->
		<div class="mb-6 grid gap-5" style:grid-template-columns="1fr 1fr">
			<div class="rounded-2xl border border-border bg-bg-elev p-4">
				<div class="mb-1.5 text-[11px] tracking-[0.08em] text-text-4 uppercase">
					{m.projects_about()}
				</div>
				<p class="text-[13.5px] leading-relaxed text-text-2">
					{p.description ?? m.projects_no_description()}
				</p>
			</div>
			<div class="relative rounded-2xl border border-border bg-bg-elev p-4">
				<div class="mb-2.5 text-[11px] tracking-[0.08em] text-text-4 uppercase">
					{m.projects_members_label()} · {data.members.length}
				</div>
				<div class="flex flex-wrap gap-1.5">
					{#each data.members as mem (mem.id)}
						<div class="relative">
							<button
								type="button"
								onclick={() => (openMemberMenu = openMemberMenu === mem.id ? null : mem.id)}
								class="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface py-1 pr-2.5 pl-1 text-[12px] transition-colors hover:border-border-strong"
							>
								<Avatar user={mem} size={18} />
								<span class="text-text">{mem.name.split(' ')[0]}</span>
								{#if mem.id === p.leadId}
									<span
										class="rounded px-1.5 py-0.5 text-[10px] tracking-[0.06em] text-accent uppercase bg-accent-soft"
									>
										{m.projects_lead_badge()}
									</span>
								{/if}
							</button>
							{#if openMemberMenu === mem.id}
								<div
									use:clickOutside={() => (openMemberMenu = null)}
									use:autoPlace
									in:fly={POPOVER_IN}
									class="absolute top-full z-40 mt-1.5 min-w-[200px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
								>
									<div class="px-2 pt-1 pb-1 text-[10.5px] tracking-[0.08em] text-text-4 uppercase">
										{m.projects_role_label()}
									</div>
									{#each PROJECT_ROLES as r (r.id)}
										{@const active = mem.role === r.id}
										<button
											type="button"
											onclick={() => setRole(mem.id, r.id)}
											disabled={busy === `memberSetRole:${mem.id}` || active}
											class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-text-2 hover:bg-surface-2 hover:text-text disabled:cursor-default disabled:opacity-100"
										>
											<span class="h-1.5 w-1.5 rounded-full" style:background={r.color}></span>
											<span class={active ? 'font-medium text-text' : ''}>{r.label}</span>
											{#if active}
												<span class="ml-auto text-text-3"><Icon name="check" size={12} /></span>
											{/if}
										</button>
									{/each}
									<div class="my-1 border-t border-border/60"></div>
									{#if mem.id === p.leadId}
										<button
											type="button"
											onclick={clearLead}
											disabled={busy === 'leadSet:'}
											class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-text-2 hover:bg-surface-2 hover:text-text disabled:opacity-50"
										>
											<Icon name="star" size={12} />
											{m.projects_remove_as_lead()}
										</button>
									{:else}
										<button
											type="button"
											onclick={() => setLead(mem.id)}
											disabled={busy === `leadSet:${mem.id}`}
											class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-text-2 hover:bg-surface-2 hover:text-text disabled:opacity-50"
										>
											<Icon name="star" size={12} />
											{m.projects_set_as_lead()}
										</button>
									{/if}
									<div class="my-1 border-t border-border/60"></div>
									<button
										type="button"
										onclick={() => removeMember(mem.id, mem.name)}
										disabled={busy === `memberRemove:${mem.id}`}
										class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-text-2 hover:bg-surface-2 hover:text-text disabled:opacity-50"
									>
										<Icon name="x" size={12} />
										{m.common_remove()}
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
							class="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-[12px] text-text-3 transition-colors hover:border-border-strong hover:text-text"
						>
							<Icon name="plus" size={11} />
							{m.common_add()}
						</button>
						{#if addingMember}
							<div
								use:clickOutside={() => (addingMember = false)}
								use:autoPlace
								in:fly={POPOVER_IN}
								class="absolute top-full z-50 mt-1.5 w-[280px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
							>
								<div class="mb-1.5 flex items-center gap-2 border-b border-border px-2 pt-1 pb-2">
									<span class="text-text-3"><Icon name="search" size={13} /></span>
									<input
										type="text"
										bind:value={memberSearch}
										placeholder={m.projects_add_teammate_placeholder()}
										class="flex-1 border-0 bg-transparent text-[13px] outline-none placeholder:text-text-3"
									/>
								</div>
								<div class="max-h-[280px] overflow-y-auto">
									{#each candidates as u (u.id)}
										<button
											type="button"
											onclick={() => addMember(u.id)}
											disabled={busy === `memberAdd:${u.id}`}
											class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text disabled:opacity-50"
										>
											<Avatar user={u} size={22} />
											<span class="min-w-0 flex-1">
												<span class="block truncate text-[13px]">{u.name}</span>
												<span class="block truncate font-mono text-[11px] text-text-3"
													>{u.email}</span
												>
											</span>
										</button>
									{/each}
									{#if candidates.length === 0}
										<div class="px-2 py-3 text-center text-[12px] text-text-3">
											{memberSearch ? m.projects_no_matches() : m.projects_everyone_member()}
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
		<div class="mb-7 grid grid-cols-4 gap-3">
			<div class="rounded-2xl border border-border bg-bg-elev p-4">
				<div class="text-[11px] tracking-[0.08em] text-text-4 uppercase">
					{m.projects_total_tasks()}
				</div>
				<div class="mt-1.5 font-mono text-[24px] font-semibold">{total}</div>
			</div>
			<div class="rounded-2xl border border-border bg-bg-elev p-4">
				<div class="text-[11px] tracking-[0.08em] text-text-4 uppercase">
					{m.projects_in_progress()}
				</div>
				<div class="mt-1.5 font-mono text-[24px] font-semibold text-[#f0a85c]">{active}</div>
			</div>
			<div class="rounded-2xl border border-border bg-bg-elev p-4">
				<div class="text-[11px] tracking-[0.08em] text-text-4 uppercase">
					{m.projects_completed()}
				</div>
				<div class="mt-1.5 font-mono text-[24px] font-semibold text-[#7fc8a9]">{done}</div>
			</div>
			<div class="rounded-2xl border border-border bg-bg-elev p-4">
				<div class="mb-1.5 text-[11px] tracking-[0.08em] text-text-4 uppercase">
					{m.projects_progress()}
				</div>
				<div class="mb-2 font-mono text-[24px] font-semibold">
					{pct}<span class="text-[14px] text-text-3">%</span>
				</div>
				<div class="h-1.5 overflow-hidden rounded-full bg-surface">
					<div class="h-full" style:width="{pct}%" style:background={p.color}></div>
				</div>
			</div>
		</div>

		<!-- tasks -->
		<div class="overflow-hidden rounded-2xl border border-border bg-bg-elev">
			<div class="flex items-center gap-2.5 border-b border-border px-4 py-3">
				<span class="text-[14px] font-semibold">{m.projects_tasks()}</span>
				<span class="font-mono text-[11px] text-text-3">{tasks.length}</span>
			</div>
			{#if tasks.length === 0}
				<EmptyState
					icon="check-square"
					title={m.projects_no_tasks_title()}
					hint={m.projects_no_tasks_hint()}
				/>
			{:else}
				{#each groups as g (g.id)}
					<div class="flex items-center gap-2 border-b border-border bg-surface/30 px-4 py-2">
						<span class="h-2 w-2 rounded-full" style:background={g.dot}></span>
						<span class="text-[12px] font-semibold text-text">{statusLabel(g.id)}</span>
						<span class="font-mono text-[11px] text-text-3">{g.tasks.length}</span>
					</div>
					{#each g.tasks as t (t.id)}
						<TaskRow task={t} selected={selectedId === t.id} onclick={() => (selectedId = t.id)} />
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
	projectId={data.project.id}
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
	memberProjectIds={Object.keys(data.memberRoles.projects)}
	allAccess={data.isTrackrTeam}
/>
