<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import type { ActionResult } from '@sveltejs/kit';
	import Icon from '$lib/components/Icon.svelte';
	import Button from '$lib/components/Button.svelte';
	import IconButton from '$lib/components/IconButton.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import EditOrganizationModal from '$lib/components/admin/EditOrganizationModal.svelte';
	import { confirm as uiConfirm } from '$lib/components/confirm.svelte';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { autoPlace } from '$lib/actions/autoPlace';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/config/motion';
	import { showToast } from '$lib/stores/toast.svelte';
	import { m } from '$lib/paraglide/messages';
	import { orgRoleLabel, projectStatusLabel } from '$lib/utils/labels';
	import type { PageData } from './$types';

	type LayoutShape = {
		users?: { id: string; name: string; email: string; initials: string; color: string }[];
	};

	let { data }: { data: PageData } = $props();

	// Role options depend on whether the org is the internal Trackr org.
	// Server enforces the same — these are just for the picker UI.
	type OrgRole = string;

	const ROLE_META: Record<string, { label: string; color: string }> = {
		'org.superadmin': { label: 'Superadmin', color: '#ef7a6d' },
		'org.admin': { label: 'Admin', color: '#c08bd6' },
		'org.staff': { label: 'Staff', color: '#7a9cf0' },
		'org.client': { label: 'Client', color: '#7fc8a9' },
		'org.agent': { label: 'Agent', color: '#e0a35c' },
		'org.member': { label: 'Member', color: '#8fb6c4' }
	};

	const ROLES = $derived(data.allowedRoles as OrgRole[]);
	// Default role for newly-added members: lowest available for the org type.
	const DEFAULT_ROLE = $derived(data.org.isInternal ? 'org.staff' : 'org.member');
	let editing = $state(false);

	function initials(n: string): string {
		return (
			n
				.split(/\s+/)
				.map((p) => p[0])
				.filter(Boolean)
				.slice(0, 2)
				.join('')
				.toUpperCase() || '·'
		);
	}

	let addingMember = $state(false);
	let memberSearch = $state('');
	let busyMember = $state<string | null>(null);
	let openRoleMenu = $state<string | null>(null);

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
		action: 'memberAdd' | 'memberSetRole' | 'memberRemove',
		userId: string,
		extra?: Record<string, string>
	): Promise<boolean> {
		busyMember = `${action}:${userId}`;
		const fd = new FormData();
		fd.append('userId', userId);
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
					? ((result.data as { message?: string } | undefined)?.message ?? m.admin_action_failed())
					: result.type === 'error'
						? (result.error?.message ?? m.admin_action_failed())
						: m.admin_action_failed();
			showToast('err', msg);
		} catch {
			showToast('err', m.admin_network_error());
		} finally {
			busyMember = null;
		}
		return false;
	}

	async function addMember(userId: string) {
		const ok = await postMember('memberAdd', userId, { role: DEFAULT_ROLE });
		if (ok) {
			memberSearch = '';
			addingMember = false;
		}
	}

	async function setRole(userId: string, role: OrgRole) {
		openRoleMenu = null;
		await postMember('memberSetRole', userId, { role });
	}

	async function removeMember(userId: string, name: string) {
		const ok = await uiConfirm({
			title: m.admin_member_remove_title(),
			message: m.admin_member_remove_message({ name, org: data.org.name }),
			confirmLabel: m.common_remove(),
			tone: 'danger'
		});
		if (!ok) return;
		await postMember('memberRemove', userId);
	}

	async function onArchive() {
		const ok = await uiConfirm({
			title: data.org.archivedAt ? m.admin_org_unarchive_title() : m.admin_org_archive_title(),
			message: data.org.archivedAt
				? m.admin_org_unarchive_message({ org: data.org.name })
				: m.admin_org_archive_message({ org: data.org.name }),
			confirmLabel: data.org.archivedAt ? m.admin_org_unarchive_confirm() : m.common_archive(),
			tone: data.org.archivedAt ? 'default' : 'warn'
		});
		if (!ok) return;

		const action = data.org.archivedAt ? 'unarchive' : 'archive';
		const res = await fetch(`?/${action}`, {
			method: 'POST',
			headers: { 'x-sveltekit-action': 'true' },
			body: new FormData()
		});
		if (res.ok) {
			if (!data.org.archivedAt) {
				await goto('/admin/directory/organizations');
			} else {
				location.reload();
			}
		}
	}
</script>

<svelte:head><title>{m.admin_org_detail_page_title({ name: data.org.name })}</title></svelte:head>

<!-- Chrome (Topbar, scroll container, tabs) comes from the Directory layout. -->
<a
	href="/admin/directory/organizations"
	class="mb-5 inline-flex items-center gap-1.5 text-[14px] text-text-3 hover:text-text"
>
	<Icon name="chevron-r" size={12} class="rotate-180" />
	{m.admin_organizations_title()}
</a>

<!-- hero -->
<div class="mb-6 flex items-start gap-4">
	<div
		class="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-[17px] font-semibold text-white shadow-edge"
		style:background="linear-gradient(140deg, {data.org.color}, color-mix(in oklch, {data.org.color} 70%,
		#000) 85%)"
	>
		{initials(data.org.name)}
	</div>
	<div class="min-w-0 flex-1">
		<div class="flex items-center gap-2">
			<h1 class="text-[26px] font-semibold tracking-[-0.014em] text-text">{data.org.name}</h1>
			{#if data.org.archivedAt}
				<span
					class="rounded bg-status-todo/16 px-1.5 py-0.5 text-[12px] tracking-[0.06em] text-text-3 uppercase"
				>
					{m.admin_org_archived_badge()}
				</span>
			{/if}
		</div>
		<div class="mt-1 flex items-center gap-2 font-mono text-[14px] text-text-3">
			<span
				class="rounded-md border border-border bg-surface px-1.5 py-0.5 text-[12px] font-medium text-text-2"
				>{data.org.key}</span
			>
			<span>{data.org.slug}</span>
		</div>
	</div>
	<div class="flex items-center gap-2">
		<Button variant="default" size="sm" onclick={() => (editing = true)}>
			<Icon name="settings" size={14} />
			{m.common_edit()}
		</Button>
		<Button variant="default" size="sm" onclick={onArchive}>
			<Icon name={data.org.archivedAt ? 'refresh' : 'x'} size={14} />
			{data.org.archivedAt ? m.admin_org_unarchive_confirm() : m.common_archive()}
		</Button>
	</div>
</div>

{#if data.org.description}
	<div class="mb-6 rounded-2xl border border-border bg-bg-elev p-4">
		<div class="mb-1.5 text-[12px] tracking-[0.08em] text-text-4 uppercase">
			{m.admin_org_about()}
		</div>
		<p class="text-[14px] leading-relaxed text-text-2">{data.org.description}</p>
	</div>
{/if}

<!-- members -->
<div class="relative mb-5 rounded-2xl border border-border bg-bg-elev">
	<div class="flex items-center gap-2.5 border-b border-border px-4 py-3">
		<span class="text-[15px] font-semibold">{m.admin_members()}</span>
		<span class="font-mono text-[12px] text-text-3">{data.members.length}</span>
		<div class="relative ml-auto">
			<Button
				variant="default"
				size="sm"
				onclick={() => {
					addingMember = !addingMember;
					memberSearch = '';
				}}
			>
				<Icon name="plus" size={14} />
				{m.admin_org_add_member()}
			</Button>
			{#if addingMember}
				<div
					use:clickOutside={() => (addingMember = false)}
					use:autoPlace
					in:fly={POPOVER_IN}
					class="absolute top-full z-50 mt-1.5 w-[308px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
				>
					<div class="mb-1.5 flex items-center gap-2 border-b border-border px-2 pt-1 pb-2">
						<span class="text-text-3"><Icon name="search" size={14} /></span>
						<input
							type="text"
							bind:value={memberSearch}
							placeholder={m.admin_org_add_user_placeholder()}
							class="flex-1 border-0 bg-transparent text-[14px] outline-none placeholder:text-text-3"
						/>
					</div>
					<div class="max-h-[308px] overflow-y-auto">
						{#each candidates as u (u.id)}
							<button
								type="button"
								onclick={() => addMember(u.id)}
								disabled={busyMember === `memberAdd:${u.id}`}
								class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text disabled:opacity-50"
							>
								<Avatar user={u} size={24} />
								<span class="min-w-0 flex-1">
									<span class="block truncate text-[14px]">{u.name}</span>
									<span class="block truncate font-mono text-[12px] text-text-3">{u.email}</span>
								</span>
							</button>
						{/each}
						{#if candidates.length === 0}
							<div class="px-2 py-3 text-center text-[13px] text-text-3">
								{memberSearch ? m.admin_org_no_matches() : m.admin_org_everyone_member()}
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>

	{#if data.members.length === 0}
		<div class="px-5 py-8 text-center text-[14px] text-text-3">
			{m.admin_org_no_members()}
		</div>
	{:else}
		{#each data.members as member (member.id)}
			{@const role = (
				ROLES.includes(member.role as OrgRole) ? member.role : DEFAULT_ROLE
			) as OrgRole}
			{@const meta = ROLE_META[role] ?? { label: orgRoleLabel(role), color: '#7c7c84' }}
			{@const locked = member.locked}
			<div
				class="flex items-center gap-3 border-b border-border/40 px-5 py-2.5 text-[14px] last:border-b-0"
			>
				<Avatar user={member} size={31} />
				<div class="min-w-0 flex-1">
					<div class="truncate font-medium text-text">{member.name}</div>
					<div class="truncate font-mono text-[12px] text-text-3">{member.email}</div>
				</div>
				<div class="relative">
					<button
						type="button"
						disabled={locked}
						onclick={() => (openRoleMenu = openRoleMenu === member.id ? null : member.id)}
						class="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-medium hover:bg-surface disabled:cursor-default disabled:hover:bg-transparent"
						style:color={meta.color}
						style:background={meta.color + '22'}
					>
						<span class="h-1.5 w-1.5 rounded-full" style:background={meta.color}></span>
						{orgRoleLabel(role)}
						{#if !locked}<Icon name="chevron" size={11} />{/if}
					</button>
					{#if openRoleMenu === member.id && !locked}
						<div
							use:clickOutside={() => (openRoleMenu = null)}
							use:autoPlace
							in:fly={POPOVER_IN}
							class="absolute top-full z-40 mt-1.5 min-w-[154px] rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
						>
							{#each ROLES as r (r)}
								<button
									type="button"
									onclick={() => setRole(member.id, r)}
									class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
								>
									<span class="h-1.5 w-1.5 rounded-full" style:background={ROLE_META[r].color}
									></span>
									<span class="text-[14px]">{orgRoleLabel(r)}</span>
									{#if r === role}
										<span class="ml-auto text-accent"><Icon name="check" size={13} /></span>
									{/if}
								</button>
							{/each}
						</div>
					{/if}
				</div>
				{#if !locked}
					<IconButton
						size={31}
						ariaLabel={m.admin_org_remove_member()}
						onclick={() => removeMember(member.id, member.name)}
					>
						{#if busyMember === `memberRemove:${member.id}`}
							<span
								class="h-3 w-3 animate-spin rounded-full border-2 border-text-3 border-t-transparent"
							></span>
						{:else}
							<Icon name="x" size={14} />
						{/if}
					</IconButton>
				{:else}
					<span class="w-[31px]"></span>
				{/if}
			</div>
		{/each}
	{/if}
</div>

<!-- projects -->
<div class="overflow-hidden rounded-2xl border border-border bg-bg-elev">
	<div class="flex items-center gap-2.5 border-b border-border px-4 py-3">
		<span class="text-[15px] font-semibold">{m.admin_projects()}</span>
		<span class="font-mono text-[12px] text-text-3">{data.projects.length}</span>
	</div>
	{#if data.projects.length === 0}
		<EmptyState
			icon="folder"
			title={m.admin_org_no_projects_title()}
			hint={m.admin_org_no_projects_hint()}
		/>
	{:else}
		{#each data.projects as p (p.id)}
			<a
				href="/projects/{p.id}"
				class="flex items-center gap-3 border-b border-border/40 px-5 py-2.5 text-[14px] transition-colors last:border-b-0 hover:bg-[var(--row-hover)]"
			>
				<span
					class="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[13px] font-semibold text-white"
					style:background="linear-gradient(140deg, {p.color}, color-mix(in oklch, {p.color} 70%, #000)
					85%)">{p.icon}</span
				>
				<span class="min-w-0 flex-1">
					<span class="block truncate font-medium text-text">{p.name}</span>
					<span class="block font-mono text-[12px] text-text-3">{p.key}</span>
				</span>
				<span class="text-[14px] text-text-2">{projectStatusLabel(p.status)}</span>
				<span class="grid place-items-center text-text-3"><Icon name="chevron-r" size={13} /></span>
			</a>
		{/each}
	{/if}
</div>

<EditOrganizationModal open={editing} org={data.org} onclose={() => (editing = false)} />
