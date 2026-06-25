<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import type { ActionResult } from '@sveltejs/kit';
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Button from '$lib/components/Button.svelte';
	import IconButton from '$lib/components/IconButton.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
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
		'org.member': { label: 'Member', color: '#8fb6c4' }
	};

	const ROLES = $derived(data.allowedRoles as OrgRole[]);
	// Default role for newly-added members: lowest available for the org type.
	const DEFAULT_ROLE = $derived(data.org.isInternal ? 'org.staff' : 'org.member');
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

	let editing = $state(false);
	let name = $state('');
	let slug = $state('');
	let description = $state('');
	let color = $state('#7a9cf0');
	let saving = $state(false);
	let serverError = $state<string | null>(null);

	$effect(() => {
		// Snap form fields to server values (re-runs whenever load refreshes).
		name = data.org.name;
		slug = data.org.slug;
		description = data.org.description ?? '';
		color = data.org.color;
	});

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
				await goto('/admin/organizations');
			} else {
				location.reload();
			}
		}
	}
</script>

<svelte:head><title>{m.admin_org_detail_page_title({ name: data.org.name })}</title></svelte:head>

<Topbar
	crumbs={[
		{ label: m.admin_crumb_workspace(), href: '/tasks' },
		{ label: m.admin_organizations_title(), href: '/admin/organizations' },
		{ label: data.org.name }
	]}
/>

<div class="min-h-0 flex-1 overflow-y-auto">
	<div class="px-6 py-6">
		<a
			href="/admin/organizations"
			class="mb-5 inline-flex items-center gap-1.5 text-[12.5px] text-text-3 hover:text-text"
		>
			<Icon name="chevron-r" size={11} class="rotate-180" />
			{m.admin_organizations_title()}
		</a>

		<!-- hero -->
		<div class="mb-6 flex items-start gap-4">
			<div
				class="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-[16px] font-semibold text-white"
				style:background="linear-gradient(140deg, {data.org.color}, color-mix(in oklch, {data.org
					.color} 70%, #000) 85%)"
				style:box-shadow="0 1px 0 rgba(255,255,255,0.18) inset"
			>
				{initials(data.org.name)}
			</div>
			<div class="min-w-0 flex-1">
				<div class="flex items-center gap-2">
					<h1 class="text-[26px] font-semibold tracking-[-0.014em] text-text">{data.org.name}</h1>
					{#if data.org.archivedAt}
						<span
							class="rounded px-1.5 py-0.5 text-[10.5px] tracking-[0.06em] text-text-3 uppercase bg-status-todo/16"
						>
							{m.admin_org_archived_badge()}
						</span>
					{/if}
				</div>
				<div class="mt-1 font-mono text-[12.5px] text-text-3">{data.org.slug}</div>
			</div>
			<div class="flex items-center gap-2">
				{#if !editing}
					<Button variant="default" size="sm" onclick={() => (editing = true)}>
						<Icon name="settings" size={13} />
						{m.common_edit()}
					</Button>
				{/if}
				<Button variant="default" size="sm" onclick={onArchive}>
					<Icon name={data.org.archivedAt ? 'refresh' : 'x'} size={13} />
					{data.org.archivedAt ? m.admin_org_unarchive_confirm() : m.common_archive()}
				</Button>
			</div>
		</div>

		{#if editing}
			<form
				method="POST"
				action="?/update"
				use:enhance={() => {
					saving = true;
					serverError = null;
					return async ({ result, update }) => {
						saving = false;
						if (result.type === 'success') {
							editing = false;
							await update();
						} else if (result.type === 'failure') {
							serverError =
								(result.data as { message?: string } | undefined)?.message ?? m.admin_save_failed();
						} else if (result.type === 'error') {
							serverError = result.error?.message ?? m.admin_save_failed();
						}
					};
				}}
				class="mb-6 space-y-4 rounded-2xl border border-border bg-bg-elev p-5"
			>
				<div>
					<label
						for="o-name"
						class="mb-1.5 block text-[11px] tracking-[0.08em] text-text-4 uppercase"
					>
						{m.admin_name()}
					</label>
					<input
						id="o-name"
						name="name"
						bind:value={name}
						required
						class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-[13px] outline-none focus:border-border-strong"
					/>
				</div>
				<div>
					<label
						for="o-slug"
						class="mb-1.5 block text-[11px] tracking-[0.08em] text-text-4 uppercase"
					>
						{m.admin_slug()}
					</label>
					<input
						id="o-slug"
						name="slug"
						bind:value={slug}
						class="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[13px] outline-none focus:border-border-strong"
					/>
				</div>
				<div>
					<label
						for="o-desc"
						class="mb-1.5 block text-[11px] tracking-[0.08em] text-text-4 uppercase"
					>
						{m.admin_org_description_label()}
					</label>
					<textarea
						id="o-desc"
						name="description"
						bind:value={description}
						rows="3"
						class="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-[13px] outline-none focus:border-border-strong"
					></textarea>
				</div>
				<div>
					<div class="mb-2 text-[11px] tracking-[0.08em] text-text-4 uppercase">
						{m.admin_color()}
					</div>
					<div class="flex flex-wrap gap-1.5">
						{#each PALETTE as c (c)}
							<button
								type="button"
								onclick={() => (color = c)}
								aria-label={m.admin_pick_color({ color: c })}
								class="relative h-7 w-7 rounded-lg"
								style:background="linear-gradient(140deg, {c}, color-mix(in oklch, {c} 70%, #000) 85%)"
								style:box-shadow={color === c
									? `0 0 0 2px var(--bg-elev), 0 0 0 4px ${c}`
									: '0 1px 0 rgba(255,255,255,0.18) inset'}
							></button>
						{/each}
					</div>
					<input type="hidden" name="color" value={color} />
				</div>
				{#if serverError}
					<div
						class="rounded-lg border px-3 py-2 text-[12.5px] border-prio-urgent/35 bg-prio-urgent/8 text-accent"
					>
						{serverError}
					</div>
				{/if}
				<div class="flex items-center justify-end gap-2 pt-1">
					<Button
						variant="default"
						onclick={() => {
							editing = false;
							serverError = null;
						}}
					>
						{m.common_cancel()}
					</Button>
					<button
						type="submit"
						disabled={saving || !name.trim()}
						class="inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-accent px-[11px] py-[7px] text-[13px] font-medium text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
					>
						{saving ? m.common_saving() : m.common_save_changes()}
					</button>
				</div>
			</form>
		{:else if data.org.description}
			<div class="mb-6 rounded-2xl border border-border bg-bg-elev p-4">
				<div class="mb-1.5 text-[11px] tracking-[0.08em] text-text-4 uppercase">
					{m.admin_org_about()}
				</div>
				<p class="text-[13.5px] leading-relaxed text-text-2">{data.org.description}</p>
			</div>
		{/if}

		<!-- members -->
		<div class="relative mb-5 rounded-2xl border border-border bg-bg-elev">
			<div class="flex items-center gap-2.5 border-b border-border px-4 py-3">
				<span class="text-[14px] font-semibold">{m.admin_members()}</span>
				<span class="font-mono text-[11px] text-text-3">{data.members.length}</span>
				<div class="relative ml-auto">
					<Button
						variant="default"
						size="sm"
						onclick={() => {
							addingMember = !addingMember;
							memberSearch = '';
						}}
					>
						<Icon name="plus" size={13} />
						{m.admin_org_add_member()}
					</Button>
					{#if addingMember}
						<div
							use:clickOutside={() => (addingMember = false)}
							use:autoPlace
							in:fly={POPOVER_IN}
							class="absolute top-full z-50 mt-1.5 w-[280px] rounded-[10px] border border-border bg-bg-elev p-1.5"
							style:box-shadow="var(--shadow-lg)"
						>
							<div class="mb-1.5 flex items-center gap-2 border-b border-border px-2 pt-1 pb-2">
								<span class="text-text-3"><Icon name="search" size={13} /></span>
								<input
									type="text"
									bind:value={memberSearch}
									placeholder={m.admin_org_add_user_placeholder()}
									class="flex-1 border-0 bg-transparent text-[13px] outline-none placeholder:text-text-3"
								/>
							</div>
							<div class="max-h-[280px] overflow-y-auto">
								{#each candidates as u (u.id)}
									<button
										type="button"
										onclick={() => addMember(u.id)}
										disabled={busyMember === `memberAdd:${u.id}`}
										class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text disabled:opacity-50"
									>
										<Avatar user={u} size={22} />
										<span class="min-w-0 flex-1">
											<span class="block truncate text-[13px]">{u.name}</span>
											<span class="block truncate font-mono text-[11px] text-text-3">{u.email}</span
											>
										</span>
									</button>
								{/each}
								{#if candidates.length === 0}
									<div class="px-2 py-3 text-center text-[12px] text-text-3">
										{memberSearch ? m.admin_org_no_matches() : m.admin_org_everyone_member()}
									</div>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			</div>

			{#if data.members.length === 0}
				<div class="px-5 py-8 text-center text-[12.5px] text-text-3">
					{m.admin_org_no_members()}
				</div>
			{:else}
				{#each data.members as member (member.id)}
					{@const role = (
						ROLES.includes(member.role as OrgRole) ? member.role : DEFAULT_ROLE
					) as OrgRole}
					{@const meta = ROLE_META[role] ?? { label: orgRoleLabel(role), color: '#7c7c84' }}
					<div
						class="flex items-center gap-3 border-b border-border/40 px-5 py-2.5 text-[13px] last:border-b-0"
					>
						<Avatar user={member} size={28} />
						<div class="min-w-0 flex-1">
							<div class="truncate font-medium text-text">{member.name}</div>
							<div class="truncate font-mono text-[11.5px] text-text-3">{member.email}</div>
						</div>
						<div class="relative">
							<button
								type="button"
								onclick={() => (openRoleMenu = openRoleMenu === member.id ? null : member.id)}
								class="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11.5px] font-medium hover:bg-surface"
								style:color={meta.color}
								style:background={meta.color + '22'}
							>
								<span class="h-1.5 w-1.5 rounded-full" style:background={meta.color}></span>
								{orgRoleLabel(role)}
								<Icon name="chevron" size={10} />
							</button>
							{#if openRoleMenu === member.id}
								<div
									use:clickOutside={() => (openRoleMenu = null)}
									use:autoPlace
									in:fly={POPOVER_IN}
									class="absolute top-full z-40 mt-1.5 min-w-[140px] rounded-[10px] border border-border bg-bg-elev p-1.5"
									style:box-shadow="var(--shadow-lg)"
								>
									{#each ROLES as r (r)}
										<button
											type="button"
											onclick={() => setRole(member.id, r)}
											class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
										>
											<span class="h-1.5 w-1.5 rounded-full" style:background={ROLE_META[r].color}
											></span>
											<span class="text-[12.5px]">{orgRoleLabel(r)}</span>
											{#if r === role}
												<span class="ml-auto text-accent"><Icon name="check" size={12} /></span>
											{/if}
										</button>
									{/each}
								</div>
							{/if}
						</div>
						<IconButton
							size={28}
							ariaLabel={m.admin_org_remove_member()}
							onclick={() => removeMember(member.id, member.name)}
						>
							{#if busyMember === `memberRemove:${member.id}`}
								<span
									class="h-3 w-3 animate-spin rounded-full border-2 border-text-3 border-t-transparent"
								></span>
							{:else}
								<Icon name="x" size={13} />
							{/if}
						</IconButton>
					</div>
				{/each}
			{/if}
		</div>

		<!-- projects -->
		<div class="overflow-hidden rounded-2xl border border-border bg-bg-elev">
			<div class="flex items-center gap-2.5 border-b border-border px-4 py-3">
				<span class="text-[14px] font-semibold">{m.admin_projects()}</span>
				<span class="font-mono text-[11px] text-text-3">{data.projects.length}</span>
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
						class="flex items-center gap-3 border-b border-border/40 px-5 py-2.5 text-[13px] transition-colors last:border-b-0 hover:bg-[var(--row-hover)]"
					>
						<span
							class="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[12px] font-semibold text-white"
							style:background="linear-gradient(140deg, {p.color}, color-mix(in oklch, {p.color} 70%,
							#000) 85%)">{p.icon}</span
						>
						<span class="min-w-0 flex-1">
							<span class="block truncate font-medium text-text">{p.name}</span>
							<span class="block font-mono text-[11.5px] text-text-3">{p.key}</span>
						</span>
						<span class="text-[12.5px] text-text-2">{projectStatusLabel(p.status)}</span>
						<span class="grid place-items-center text-text-3"
							><Icon name="chevron-r" size={12} /></span
						>
					</a>
				{/each}
			{/if}
		</div>
	</div>
</div>
