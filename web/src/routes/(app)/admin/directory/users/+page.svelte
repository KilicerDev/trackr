<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import type { ActionResult } from '@sveltejs/kit';
	import Icon from '$lib/components/Icon.svelte';
	import Button from '$lib/components/Button.svelte';
	import IconButton from '$lib/components/IconButton.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import CreateApiKeyModal from '$lib/components/admin/CreateApiKeyModal.svelte';
	import { confirm as uiConfirm } from '$lib/components/confirm.svelte';
	import { ROLE_META, ORG_ROLE_META } from '$lib/utils/role-meta';
	import { allowedOrgRoles, type Role } from '$lib/roles';
	import { m } from '$lib/paraglide/messages';
	import { metaRoleLabel, orgRoleLabel, orgRolePerm } from '$lib/utils/labels';
	import { clickOutside } from '$lib/actions/clickOutside';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/config/motion';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type UserRow = PageData['users'][number];
	type InvitationRow = PageData['invitations'][number];
	type OrgOption = PageData['orgs'][number];

	type OrgRolePickerProps = {
		selectedOrg: OrgOption | undefined;
		orgId: string;
		orgRole: string;
		roleOptions: string[];
		pop: 'org' | 'role' | null;
		onTogglePop: (which: 'org' | 'role') => void;
		onClosePop: () => void;
		onPickOrg: (id: string) => void;
		onPickRole: (r: string) => void;
	};

	type StatusFilter = 'all' | 'active' | 'banned';
	let filter = $state<StatusFilter>('all');
	let search = $state('');
	let selected = $state<UserRow | null>(null);
	let apiKeyFor = $state<UserRow | null>(null);
	let inviteOpen = $state(false);
	let createOpen = $state(false);

	let toast = $state<{ kind: 'ok' | 'err'; msg: string } | null>(null);
	let pendingAction = $state<string | null>(null); // `${action}:${id}` to dedupe spinners

	const counts = $derived({
		all: data.users.length,
		active: data.users.filter((u) => !u.banned).length,
		banned: data.users.filter((u) => u.banned).length,
		invited: data.invitations.length
	});

	let users = $derived.by(() => {
		let list = data.users;
		if (filter === 'active') list = list.filter((u) => !u.banned);
		else if (filter === 'banned') list = list.filter((u) => u.banned);
		if (search) {
			const q = search.toLowerCase();
			list = list.filter(
				(u) => (u.name?.toLowerCase().includes(q) ?? false) || u.email.toLowerCase().includes(q)
			);
		}
		return list;
	});

	const tabs = $derived<{ id: StatusFilter; label: string }[]>([
		{ id: 'all', label: m.common_all() },
		{ id: 'active', label: m.admin_users_tab_active() },
		{ id: 'banned', label: m.admin_users_tab_banned() }
	]);

	function makeAvatar(u: { id: string; name: string | null; email: string }) {
		const name = u.name ?? u.email;
		const initials = name
			.split(/\s+/)
			.map((p) => p[0])
			.filter(Boolean)
			.slice(0, 2)
			.join('')
			.toUpperCase();
		// Stable color from id hash
		let h = 0;
		for (const c of u.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
		const hue = h % 360;
		return { id: u.id, name, initials, color: `hsl(${hue} 55% 60%)` };
	}

	function fmtDate(d: Date | string | null | undefined) {
		if (!d) return '—';
		const dt = typeof d === 'string' ? new Date(d) : d;
		return dt.toISOString().slice(0, 10);
	}

	function fmtRelative(d: Date | string): string {
		const dt = typeof d === 'string' ? new Date(d) : d;
		const ms = dt.getTime() - Date.now();
		if (ms <= 0) return m.admin_users_invite_expired();
		const days = Math.round(ms / (24 * 60 * 60 * 1000));
		if (days >= 1) return m.admin_users_invite_expires_in_days({ count: days });
		return m.admin_users_invite_expires_soon();
	}

	function showToast(kind: 'ok' | 'err', msg: string) {
		toast = { kind, msg };
		setTimeout(() => {
			if (toast?.msg === msg) toast = null;
		}, 3500);
	}

	async function postAction(action: string, fields: Record<string, string>): Promise<void> {
		const body = new FormData();
		for (const [k, v] of Object.entries(fields)) body.append(k, v);
		const res = await fetch(`?/${action}`, {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		});
		const result: ActionResult = deserialize(await res.text());
		if (result.type === 'failure') {
			const msg =
				(result.data as { message?: string } | undefined)?.message ?? m.admin_action_failed();
			throw new Error(msg);
		}
		if (result.type === 'error') {
			throw new Error(result.error?.message ?? m.admin_action_failed());
		}
		await invalidateAll();
	}

	async function handleResetPassword(u: UserRow) {
		const key = `reset:${u.id}`;
		if (pendingAction === key) return;
		pendingAction = key;
		try {
			await postAction('sendPasswordReset', { userId: u.id });
			showToast('ok', m.admin_users_reset_sent({ email: u.email }));
		} catch (e) {
			showToast('err', e instanceof Error ? e.message : m.admin_failed());
		} finally {
			pendingAction = null;
		}
	}

	async function handleImpersonate(u: UserRow) {
		const key = `imp:${u.id}`;
		if (pendingAction === key) return;
		pendingAction = key;
		try {
			await postAction('impersonateUser', { userId: u.id });
			await goto('/', { invalidateAll: true });
		} catch (e) {
			showToast('err', e instanceof Error ? e.message : m.admin_failed());
			pendingAction = null;
		}
	}

	async function handleDelete(u: UserRow) {
		const ok = await uiConfirm({
			title: m.admin_users_delete_title(),
			message: m.admin_users_delete_message({ email: u.email }),
			confirmLabel: m.admin_users_delete_confirm(),
			cancelLabel: m.admin_users_keep(),
			tone: 'danger'
		});
		if (!ok) return;
		const key = `del:${u.id}`;
		if (pendingAction === key) return;
		pendingAction = key;
		try {
			await postAction('deleteUser', { userId: u.id });
			showToast('ok', m.admin_users_deleted({ email: u.email }));
			selected = null;
		} catch (e) {
			showToast('err', e instanceof Error ? e.message : m.admin_failed());
		} finally {
			pendingAction = null;
		}
	}

	async function handleMcpToggle(u: UserRow, enable: boolean) {
		const who = u.name ?? u.email;
		if (!enable) {
			const ok = await uiConfirm({
				title: m.mcp_disable_title({ name: who }),
				message: m.mcp_disable_message({ name: who }),
				confirmLabel: m.mcp_disable(),
				tone: 'warn',
				icon: 'shield'
			});
			if (!ok) return;
		}
		const key = `mcp:${u.id}`;
		if (pendingAction === key) return;
		pendingAction = key;
		try {
			await postAction(enable ? 'mcpEnable' : 'mcpDisable', { userId: u.id });
			showToast('ok', enable ? m.mcp_enabled_toast() : m.mcp_disabled_toast());
		} catch (e) {
			showToast('err', e instanceof Error ? e.message : m.admin_failed());
		} finally {
			pendingAction = null;
		}
	}

	async function handleResend(inv: InvitationRow) {
		const key = `resend:${inv.id}`;
		if (pendingAction === key) return;
		pendingAction = key;
		try {
			await postAction('resendInvitation', { id: inv.id });
			showToast('ok', m.admin_users_invite_resent({ email: inv.email }));
		} catch (e) {
			showToast('err', e instanceof Error ? e.message : m.admin_failed());
		} finally {
			pendingAction = null;
		}
	}

	async function handleRevoke(inv: InvitationRow) {
		const ok = await uiConfirm({
			title: m.admin_users_revoke_title(),
			message: m.admin_users_revoke_message({ email: inv.email }),
			confirmLabel: m.admin_users_revoke_confirm(),
			cancelLabel: m.admin_users_keep(),
			tone: 'warn'
		});
		if (!ok) return;
		const key = `revoke:${inv.id}`;
		if (pendingAction === key) return;
		pendingAction = key;
		try {
			await postAction('revokeInvitation', { id: inv.id });
			showToast('ok', m.admin_users_invite_revoked({ email: inv.email }));
		} catch (e) {
			showToast('err', e instanceof Error ? e.message : m.admin_failed());
		} finally {
			pendingAction = null;
		}
	}

	// Org / role pickers. The org-role is the source of truth — the better-auth
	// user.role is derived from it on the server, so we only ask once.
	function rolesForOrg(orgId: string): string[] {
		const org = data.orgs.find((o) => o.id === orgId);
		let roles = [...allowedOrgRoles(org?.isInternal ?? false)] as string[];
		// Only superadmins can confer the superadmin tier.
		if (!data.viewerIsSuperadmin) roles = roles.filter((r) => r !== 'org.superadmin');
		return roles;
	}
	function defaultOrgId(): string {
		return data.orgs[0]?.id ?? '';
	}
	function defaultRoleFor(orgId: string): string {
		const roles = rolesForOrg(orgId);
		const org = data.orgs.find((o) => o.id === orgId);
		const preferred = org?.isInternal ? 'org.staff' : 'org.member';
		return roles.includes(preferred) ? preferred : (roles[roles.length - 1] ?? '');
	}

	// Create user modal state
	let cName = $state('');
	let cEmail = $state('');
	let cPassword = $state('');
	let cOrgId = $state(defaultOrgId());
	let cOrgRole = $state(defaultRoleFor(defaultOrgId()));
	let cSubmitting = $state(false);
	let cError = $state<string | null>(null);

	const cRoleOptions = $derived(rolesForOrg(cOrgId));
	const cSelectedOrg = $derived(data.orgs.find((o) => o.id === cOrgId));
	let cPop = $state<'org' | 'role' | null>(null);

	function pickCreateOrg(orgId: string) {
		cOrgId = orgId;
		cOrgRole = defaultRoleFor(orgId);
		cPop = null;
	}

	function resetCreate() {
		cName = '';
		cEmail = '';
		cPassword = '';
		cOrgId = defaultOrgId();
		cOrgRole = defaultRoleFor(cOrgId);
		cError = null;
	}

	function generatePassword() {
		const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
		const bytes = new Uint8Array(16);
		crypto.getRandomValues(bytes);
		let out = '';
		for (const b of bytes) out += alphabet[b % alphabet.length];
		cPassword = out;
	}

	async function submitCreate(e: Event) {
		e.preventDefault();
		cError = null;
		if (cPassword.length < 8) {
			cError = m.admin_users_password_min();
			return;
		}
		if (!cOrgId || !cOrgRole) {
			cError = m.admin_users_pick_org_role();
			return;
		}
		cSubmitting = true;
		try {
			await postAction('createUser', {
				name: cName,
				email: cEmail,
				password: cPassword,
				orgId: cOrgId,
				orgRole: cOrgRole
			});
			showToast('ok', m.admin_users_created_toast({ email: cEmail }));
			resetCreate();
			createOpen = false;
		} catch (err) {
			cError = err instanceof Error ? err.message : m.admin_users_create_failed();
		} finally {
			cSubmitting = false;
		}
	}

	// Invite user modal state
	let iName = $state('');
	let iEmail = $state('');
	let iOrgId = $state(defaultOrgId());
	let iOrgRole = $state(defaultRoleFor(defaultOrgId()));
	let iSubmitting = $state(false);
	let iError = $state<string | null>(null);

	const iRoleOptions = $derived(rolesForOrg(iOrgId));
	const iSelectedOrg = $derived(data.orgs.find((o) => o.id === iOrgId));
	let iPop = $state<'org' | 'role' | null>(null);

	function pickInviteOrg(orgId: string) {
		iOrgId = orgId;
		iOrgRole = defaultRoleFor(orgId);
		iPop = null;
	}

	function resetInvite() {
		iName = '';
		iEmail = '';
		iOrgId = defaultOrgId();
		iOrgRole = defaultRoleFor(iOrgId);
		iError = null;
	}

	async function submitInvite(e: Event) {
		e.preventDefault();
		iError = null;
		if (!iOrgId || !iOrgRole) {
			iError = m.admin_users_pick_org_role();
			return;
		}
		iSubmitting = true;
		try {
			await postAction('inviteUser', {
				name: iName,
				email: iEmail,
				orgId: iOrgId,
				orgRole: iOrgRole
			});
			showToast('ok', m.admin_users_invite_sent({ email: iEmail }));
			resetInvite();
			inviteOpen = false;
		} catch (err) {
			iError = err instanceof Error ? err.message : m.admin_users_invite_failed();
		} finally {
			iSubmitting = false;
		}
	}

	let showPassword = $state(false);
</script>

<svelte:head><title>{m.admin_users_title()} · {m.directory_title()}</title></svelte:head>

<!-- Chrome (Topbar, scroll container, tabs) comes from the Directory layout. -->
<div class="mb-6 flex items-end gap-4">
	<div>
		<h1 class="text-[26px] font-semibold tracking-[-0.014em]">{m.admin_users_title()}</h1>
		<p class="mt-1 text-[14px] text-text-3">
			{m.admin_users_subtitle({
				total: counts.all,
				active: counts.active,
				invited: counts.invited
			})}
		</p>
	</div>
	<div class="ml-auto flex items-center gap-2">
		<Button variant="default" size="sm" onclick={() => (createOpen = true)}>
			<Icon name="user" size={14} />
			{m.admin_users_create()}
		</Button>
		<Button variant="primary" size="sm" onclick={() => (inviteOpen = true)}>
			<Icon name="plus" size={14} />
			{m.admin_users_invite()}
		</Button>
	</div>
</div>

<div class="mb-4 flex items-center gap-2.5">
	<div class="inline-flex h-8 items-center rounded-lg border border-border bg-surface p-0.5">
		{#each tabs as t (t.id)}
			<button
				type="button"
				onclick={() => (filter = t.id)}
				class="inline-flex h-full items-center gap-1.5 rounded-md px-2.5 text-[14px] transition-colors {filter ===
				t.id
					? 'bg-bg-elev text-text'
					: 'text-text-3 hover:text-text'}"
			>
				{t.label}
				<span class="font-mono text-[12px] text-text-3">
					{counts[t.id]}
				</span>
			</button>
		{/each}
	</div>
	<div class="relative ml-auto">
		<span class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-3">
			<Icon name="search" size={14} />
		</span>
		<input
			type="text"
			bind:value={search}
			placeholder={m.admin_users_search_placeholder()}
			class="h-8 w-64 rounded-lg border border-border bg-surface pr-3 pl-8 text-[14px] outline-none focus:border-border-strong"
		/>
	</div>
</div>

{#if data.invitations.length > 0}
	<div class="mb-5">
		<div class="mb-2 px-1 text-[12px] tracking-[0.08em] text-text-4 uppercase">
			{m.admin_users_pending_invitations({ count: data.invitations.length })}
		</div>
		<div class="overflow-hidden rounded-2xl border border-border bg-bg-elev">
			{#each data.invitations as inv (inv.id)}
				{@const meta =
					ORG_ROLE_META[inv.orgRole ?? ''] ?? ROLE_META[inv.role as Role] ?? ROLE_META.user}
				{@const metaLabel =
					inv.orgRole && ORG_ROLE_META[inv.orgRole]
						? orgRoleLabel(inv.orgRole)
						: metaRoleLabel((inv.role as Role) ?? 'user')}
				{@const expired = new Date(inv.expiresAt).getTime() < Date.now()}
				<div class="flex items-center gap-3 border-b border-border/40 px-5 py-3 last:border-b-0">
					<span
						class="grid h-8 w-8 place-items-center rounded-lg border border-border bg-surface text-text-3"
					>
						<Icon name="msg" size={15} />
					</span>
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2">
							<span class="truncate text-[14px] font-medium text-text">{inv.email}</span>
							<span
								class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium"
								style:background={meta.color + '22'}
								style:color={meta.color}
							>
								<span class="h-1 w-1 rounded-full" style:background={meta.color}></span>
								{metaLabel}
							</span>
						</div>
						<div class="mt-0.5 text-[12px] text-text-3">
							{m.admin_users_invited_as()} <span class="text-text-2">{inv.name}</span>
							{' · '}
							<span class={expired ? 'text-prio-urgent' : ''}>{fmtRelative(inv.expiresAt)}</span>
						</div>
					</div>
					<div class="flex items-center gap-1">
						<IconButton
							size={31}
							ariaLabel={m.admin_users_resend_invitation()}
							onclick={() => handleResend(inv)}
						>
							{#if pendingAction === `resend:${inv.id}`}
								<span
									class="h-3 w-3 animate-spin rounded-full border-2 border-text-3 border-t-transparent"
								></span>
							{:else}
								<Icon name="refresh" size={14} />
							{/if}
						</IconButton>
						<IconButton
							size={31}
							ariaLabel={m.admin_users_revoke_invitation()}
							onclick={() => handleRevoke(inv)}
						>
							<Icon name="x" size={14} />
						</IconButton>
					</div>
				</div>
			{/each}
		</div>
	</div>
{/if}

<div class="overflow-hidden rounded-2xl border border-border bg-bg-elev">
	<div
		class="grid h-9 items-center gap-3 border-b border-border px-5 text-[12px] tracking-[0.08em] text-text-4 uppercase"
		style:grid-template-columns="2fr 1fr 1fr 1fr 36px"
	>
		<span>{m.admin_users_col_user()}</span>
		<span>{m.admin_users_col_role()}</span>
		<span>{m.admin_users_col_status()}</span>
		<span>{m.admin_users_col_joined()}</span>
		<span></span>
	</div>
	{#if users.length === 0}
		<div class="px-5 py-10 text-center text-[14px] text-text-3">
			{m.admin_users_no_match()}
		</div>
	{/if}
	{#each users as u (u.id)}
		{@const meta = ROLE_META[(u.role ?? 'user') as Role] ?? ROLE_META.user}
		{@const banned = !!u.banned}
		{@const isSelf = u.id === data.currentUserId}
		<button
			type="button"
			onclick={() => (selected = u)}
			class="grid w-full items-center gap-3 border-b border-border/40 px-5 py-2.5 text-left text-[14px] transition-colors last:border-b-0 hover:bg-[var(--row-hover)] {banned
				? 'opacity-55 hover:opacity-100'
				: ''}"
			style:grid-template-columns="2fr 1fr 1fr 1fr 36px"
		>
			<span class="flex min-w-0 items-center gap-2.5">
				<Avatar user={makeAvatar(u)} size={31} />
				<span class="min-w-0">
					<span class="block truncate font-medium text-text">
						{u.name ?? '—'}
						{#if isSelf}
							<span class="ml-1 font-mono text-[12px] text-text-4">{m.admin_users_you()}</span>
						{/if}
					</span>
					<span class="block truncate font-mono text-[12px] text-text-3">{u.email}</span>
				</span>
			</span>
			<span class="flex items-center gap-1.5">
				<span class="h-1.5 w-1.5 rounded-full" style:background={meta.color}></span>
				<span style:color={meta.color}>{metaRoleLabel(u.role ?? 'user')}</span>
			</span>
			<span>
				{#if banned}
					<span
						class="inline-flex items-center gap-1.5 rounded-full bg-prio-urgent/16 px-2 py-0.5 text-[12px] text-prio-urgent"
					>
						<span class="h-1.5 w-1.5 rounded-full bg-prio-urgent"></span>
						{m.admin_users_status_banned()}
					</span>
				{:else}
					<span
						class="inline-flex items-center gap-1.5 rounded-full bg-status-done/16 px-2 py-0.5 text-[12px] text-status-done"
					>
						<span class="h-1.5 w-1.5 rounded-full bg-status-done"></span>
						{m.admin_users_status_active()}
					</span>
				{/if}
			</span>
			<span class="font-mono text-[13px] text-text-3">{fmtDate(u.createdAt)}</span>
			<span class="grid place-items-center text-text-3"><Icon name="chevron-r" size={13} /></span>
		</button>
	{/each}
</div>

<!-- Toast -->
{#if toast}
	<div
		class="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg border px-3.5 py-2 text-[14px] shadow-lg backdrop-blur-md"
		class:bg-bg-elev={toast.kind === 'ok'}
		style:background={toast.kind === 'ok' ? 'rgba(127,200,169,0.12)' : 'rgba(239,79,94,0.12)'}
		style:border-color={toast.kind === 'ok' ? 'rgba(127,200,169,0.35)' : 'rgba(239,79,94,0.35)'}
		style:color={toast.kind === 'ok' ? '#7fc8a9' : '#ef7a6d'}
	>
		{toast.msg}
	</div>
{/if}

<!-- User detail drawer -->
<Drawer open={!!selected} onclose={() => (selected = null)} width={420}>
	{#if selected}
		{@const sel = selected}
		{@const meta = ROLE_META[(sel.role ?? 'user') as Role] ?? ROLE_META.user}
		{@const banned = !!sel.banned}
		{@const isSelf = sel.id === data.currentUserId}
		{@const isRootAccount = !!sel.isRoot}
		{@const canImpersonate = data.viewerIsSuperadmin && !isSelf && !banned && !isRootAccount}
		{@const memberships = data.orgMemberships?.[sel.id] ?? []}
		{@const mcp = data.mcp?.[sel.id] ?? { enabled: false, connections: 0 }}
		{@const canToggleMcp = !banned && (!isRootAccount || isSelf)}
		<div class="flex items-center gap-2 border-b border-border px-5 pt-4 pb-3">
			<span class="font-mono text-[12px] tracking-[0.08em] text-text-4 uppercase"
				>{m.admin_users_drawer_user()}</span
			>
			<div class="ml-auto flex items-center gap-1">
				<IconButton size={31} ariaLabel={m.common_close()} onclick={() => (selected = null)}>
					<Icon name="x" size={15} />
				</IconButton>
			</div>
		</div>
		<div class="flex-1 overflow-y-auto px-5 py-5">
			<div class="mb-5 flex items-center gap-3">
				<Avatar user={makeAvatar(sel)} size={62} />
				<div class="min-w-0">
					<div class="truncate text-[20px] font-semibold tracking-[-0.01em] text-text">
						{sel.name ?? '—'}
						{#if isSelf}
							<span class="ml-1 font-mono text-[13px] text-text-4">{m.admin_users_you()}</span>
						{/if}
					</div>
					<div class="truncate font-mono text-[14px] text-text-3">{sel.email}</div>
				</div>
			</div>

			<div class="mb-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-[14px]">
				<div class="text-text-4">{m.admin_users_col_role()}</div>
				<div class="flex items-center gap-1.5">
					<span class="h-1.5 w-1.5 rounded-full" style:background={meta.color}></span>
					<span style:color={meta.color}>{metaRoleLabel(sel.role ?? 'user')}</span>
				</div>
				<div class="text-text-4">{m.admin_users_col_status()}</div>
				<div>
					{#if banned}
						<span class="text-prio-urgent">{m.admin_users_status_banned()}</span>
					{:else}
						<span class="text-status-done">{m.admin_users_status_active()}</span>
					{/if}
				</div>
				<div class="text-text-4">{m.admin_users_col_joined()}</div>
				<div class="font-mono">{fmtDate(sel.createdAt)}</div>
				<div class="text-text-4">{m.admin_users_id()}</div>
				<div class="truncate font-mono text-text-3">{sel.id}</div>
				<div class="text-text-4">{m.mcp_col_access()}</div>
				<div class="flex items-center gap-1.5">
					<span class="h-1.5 w-1.5 rounded-full {mcp.enabled ? 'bg-emerald-400' : 'bg-text-4'}"
					></span>
					<span>{mcp.enabled ? m.mcp_access_enabled() : m.mcp_access_disabled()}</span>
					{#if mcp.enabled}
						<span class="font-mono text-[12px] text-text-4"
							>· {mcp.connections} {m.mcp_col_connections().toLowerCase()}</span
						>
					{/if}
				</div>
				<div class="text-text-4">{m.settings_tab_api_keys()}</div>
				<div class="font-mono text-text-3">
					{m.admin_users_api_keys_active({ count: data.activeApiKeys?.[sel.id] ?? 0 })}
				</div>
			</div>

			<div class="mb-6">
				<div class="mb-2 font-mono text-[12px] tracking-[0.08em] text-text-4 uppercase">
					{m.admin_users_organizations()}
				</div>
				{#if memberships.length === 0}
					<div class="text-[14px] text-text-3">{m.admin_users_no_organizations()}</div>
				{:else}
					<div class="flex flex-col gap-1.5">
						{#each memberships as om (om.id)}
							{@const roleMeta = ORG_ROLE_META[om.role] ?? { color: '#7c7c84' }}
							<a
								href="/admin/directory/organizations/{om.id}"
								class="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 transition-colors hover:border-border-strong hover:bg-surface"
							>
								<span
									class="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-semibold text-white"
									style:background={om.color}
								>
									{om.name.slice(0, 1).toUpperCase()}
								</span>
								<span class="min-w-0 flex-1 truncate text-[14px] text-text">{om.name}</span>
								<span
									class="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-medium"
									style:color={roleMeta.color}
									style:background={roleMeta.color + '22'}
								>
									<span class="h-1.5 w-1.5 rounded-full" style:background={roleMeta.color}></span>
									{orgRoleLabel(om.role)}
								</span>
							</a>
						{/each}
					</div>
				{/if}
			</div>

			<div class="flex flex-col gap-2">
				{#if !isRootAccount || isSelf}
					<Button
						variant="default"
						size="sm"
						disabled={pendingAction === `reset:${sel.id}`}
						onclick={() => handleResetPassword(sel)}
					>
						<Icon name="shield" size={14} />
						{pendingAction === `reset:${sel.id}`
							? m.admin_users_sending()
							: m.admin_users_send_password_reset()}
					</Button>
				{/if}
				{#if !banned && (!isRootAccount || isSelf)}
					<Button variant="default" size="sm" onclick={() => (apiKeyFor = sel)}>
						<Icon name="shield" size={14} />
						{m.admin_users_api_key_create()}
					</Button>
				{/if}
				{#if canToggleMcp}
					<Button
						variant="default"
						size="sm"
						disabled={pendingAction === `mcp:${sel.id}`}
						onclick={() => handleMcpToggle(sel, !mcp.enabled)}
					>
						<Icon name="sparkle" size={14} />
						{pendingAction === `mcp:${sel.id}`
							? m.common_saving()
							: mcp.enabled
								? m.admin_users_mcp_disable()
								: m.admin_users_mcp_enable()}
					</Button>
				{/if}
				{#if canImpersonate}
					<Button
						variant="default"
						size="sm"
						disabled={pendingAction === `imp:${sel.id}`}
						onclick={() => handleImpersonate(sel)}
					>
						<Icon name="user" size={14} />
						{pendingAction === `imp:${sel.id}`
							? m.admin_users_starting()
							: m.admin_users_impersonate()}
					</Button>
				{/if}
				{#if !isSelf && !isRootAccount}
					<Button
						variant="default"
						size="sm"
						disabled={pendingAction === `del:${sel.id}`}
						onclick={() => handleDelete(sel)}
					>
						<Icon name="x" size={14} />
						{pendingAction === `del:${sel.id}`
							? m.admin_users_deleting()
							: m.admin_users_delete_confirm()}
					</Button>
				{/if}
			</div>
		</div>
	{/if}
</Drawer>

<!-- Issue an API key for the selected user (keys are admin-issued). -->
<CreateApiKeyModal
	open={!!apiKeyFor}
	onclose={() => (apiKeyFor = null)}
	users={apiKeyFor
		? [
				{
					id: apiKeyFor.id,
					name: apiKeyFor.name ?? apiKeyFor.email,
					email: apiKeyFor.email,
					role: apiKeyFor.role ?? null
				}
			]
		: []}
	fixedUser={apiKeyFor
		? {
				id: apiKeyFor.id,
				name: apiKeyFor.name ?? apiKeyFor.email,
				email: apiKeyFor.email,
				role: apiKeyFor.role ?? null
			}
		: null}
	action="?/apiKeyCreate"
/>

<!-- Shared org + role picker, used by both the create and invite modals -->
{#snippet orgRolePicker(p: OrgRolePickerProps)}
	<div class="grid grid-cols-2 gap-3">
		<div class="relative">
			<span class="mb-1.5 block text-[12px] tracking-[0.06em] text-text-4 uppercase"
				>{m.admin_organization()}</span
			>
			<button
				type="button"
				onclick={() => p.onTogglePop('org')}
				class="inline-flex w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-[14px] transition-colors hover:border-border-strong {p.pop ===
				'org'
					? 'border-border-strong'
					: ''}"
			>
				<span
					class="h-2 w-2 shrink-0 rounded-full"
					style:background={p.selectedOrg?.color ?? '#7a9cf0'}
				></span>
				<span class="truncate">{p.selectedOrg?.name ?? m.admin_users_select_placeholder()}</span>
				{#if p.selectedOrg?.isInternal}
					<span class="font-mono text-[11px] text-text-4">{m.admin_users_internal()}</span>
				{/if}
				<Icon name="chevron" size={12} class="ml-auto shrink-0 text-text-3" />
			</button>
			{#if p.pop === 'org'}
				<div
					use:clickOutside={p.onClosePop}
					in:fly={POPOVER_IN}
					class="absolute top-full left-0 z-50 mt-1.5 max-h-56 w-full overflow-y-auto rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
				>
					{#each data.orgs as o (o.id)}
						<button
							type="button"
							onclick={() => p.onPickOrg(o.id)}
							class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
						>
							<span class="h-2 w-2 shrink-0 rounded-full" style:background={o.color}></span>
							<span class="truncate text-[14px]">{o.name}</span>
							{#if o.isInternal}
								<span class="font-mono text-[11px] text-text-4">{m.admin_users_internal()}</span>
							{/if}
							<span class="ml-auto text-accent {p.orgId === o.id ? 'opacity-100' : 'opacity-0'}">
								<Icon name="check" size={14} />
							</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>
		<div class="relative">
			<span class="mb-1.5 block text-[12px] tracking-[0.06em] text-text-4 uppercase"
				>{m.admin_users_col_role()}</span
			>
			<button
				type="button"
				onclick={() => p.onTogglePop('role')}
				class="inline-flex w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-[14px] transition-colors hover:border-border-strong {p.pop ===
				'role'
					? 'border-border-strong'
					: ''}"
			>
				<span
					class="h-2 w-2 shrink-0 rounded-full"
					style:background={ORG_ROLE_META[p.orgRole]?.color ?? '#7a9cf0'}
				></span>
				<span class="truncate">{p.orgRole ? orgRoleLabel(p.orgRole) : p.orgRole}</span>
				<Icon name="chevron" size={12} class="ml-auto shrink-0 text-text-3" />
			</button>
			{#if p.pop === 'role'}
				<div
					use:clickOutside={p.onClosePop}
					in:fly={POPOVER_IN}
					class="absolute top-full left-0 z-50 mt-1.5 w-full rounded-[10px] border border-border bg-bg-elev p-1.5 shadow-lg"
				>
					{#each p.roleOptions as r (r)}
						<button
							type="button"
							onclick={() => p.onPickRole(r)}
							class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
						>
							<span
								class="h-2 w-2 shrink-0 rounded-full"
								style:background={ORG_ROLE_META[r]?.color ?? '#7a9cf0'}
							></span>
							<span class="truncate text-[14px]">{orgRoleLabel(r)}</span>
							<span class="ml-auto text-accent {p.orgRole === r ? 'opacity-100' : 'opacity-0'}">
								<Icon name="check" size={14} />
							</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
	{#if p.orgRole}
		<p class="mt-2 text-[12px] text-text-3">{orgRolePerm(p.orgRole)}</p>
	{/if}
{/snippet}

<!-- Create user modal -->
<Modal
	open={createOpen}
	onclose={() => {
		createOpen = false;
		resetCreate();
	}}
	maxWidth={480}
>
	<form onsubmit={submitCreate}>
		<div class="flex items-center border-b border-border px-5 pt-4 pb-3">
			<div>
				<div class="text-[12px] tracking-[0.08em] text-text-4 uppercase">{m.admin_workspace()}</div>
				<div class="text-[15px] font-semibold">{m.admin_users_create_title()}</div>
			</div>
			<button
				type="button"
				class="ml-auto grid h-8 w-8 place-items-center rounded-lg text-text-3 hover:bg-surface hover:text-text"
				onclick={() => {
					createOpen = false;
					resetCreate();
				}}
				aria-label={m.common_close()}
			>
				<Icon name="x" size={15} />
			</button>
		</div>
		<div class="space-y-4 p-5">
			<div>
				<label for="c-name" class="mb-1.5 block text-[12px] tracking-[0.06em] text-text-4 uppercase"
					>{m.admin_name()}</label
				>
				<input
					id="c-name"
					bind:value={cName}
					required
					type="text"
					placeholder={m.admin_users_name_placeholder()}
					class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-[14px] outline-none focus:border-border-strong"
				/>
			</div>
			<div>
				<label
					for="c-email"
					class="mb-1.5 block text-[12px] tracking-[0.06em] text-text-4 uppercase"
					>{m.admin_users_email()}</label
				>
				<input
					id="c-email"
					bind:value={cEmail}
					required
					type="email"
					placeholder={m.admin_users_email_placeholder()}
					class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-[14px] outline-none focus:border-border-strong"
				/>
			</div>
			<div>
				<label
					for="c-password"
					class="mb-1.5 block text-[12px] tracking-[0.06em] text-text-4 uppercase"
					>{m.admin_users_initial_password()}</label
				>
				<div class="relative">
					<input
						id="c-password"
						bind:value={cPassword}
						required
						minlength={8}
						type={showPassword ? 'text' : 'password'}
						placeholder={m.admin_users_password_placeholder()}
						class="w-full rounded-lg border border-border bg-surface py-2 pr-20 pl-3 font-mono text-[14px] outline-none focus:border-border-strong"
					/>
					<div class="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-0.5">
						<button
							type="button"
							onclick={() => (showPassword = !showPassword)}
							class="grid h-7 w-7 place-items-center rounded-md text-text-3 hover:bg-[var(--row-hover)] hover:text-text"
							aria-label={showPassword
								? m.admin_users_hide_password()
								: m.admin_users_show_password()}
							tabindex={-1}
						>
							<Icon name={showPassword ? 'x' : 'user'} size={14} />
						</button>
						<button
							type="button"
							onclick={generatePassword}
							class="h-7 rounded-md px-1.5 text-[12px] font-medium text-text-3 hover:bg-[var(--row-hover)] hover:text-text"
							tabindex={-1}
						>
							{m.admin_users_generate()}
						</button>
					</div>
				</div>
			</div>
			{@render orgRolePicker({
				selectedOrg: cSelectedOrg,
				orgId: cOrgId,
				orgRole: cOrgRole,
				roleOptions: cRoleOptions,
				pop: cPop,
				onTogglePop: (w) => (cPop = cPop === w ? null : w),
				onClosePop: () => (cPop = null),
				onPickOrg: pickCreateOrg,
				onPickRole: (r) => {
					cOrgRole = r;
					cPop = null;
				}
			})}
			{#if cError}
				<div
					class="rounded-lg border border-prio-urgent/35 bg-prio-urgent/8 px-3 py-2 text-[14px] text-accent"
				>
					{cError}
				</div>
			{/if}
		</div>
		<div
			class="flex items-center justify-end gap-2 rounded-b-2xl border-t border-border bg-bg/40 px-5 py-3"
		>
			<Button
				variant="default"
				size="sm"
				onclick={() => {
					createOpen = false;
					resetCreate();
				}}
			>
				{m.common_cancel()}
			</Button>
			<button
				type="submit"
				disabled={cSubmitting}
				class="inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-accent px-[12px] py-[8px] text-[14px] font-medium text-white shadow-btn transition-[background,border-color,transform] duration-150 hover:bg-accent-strong active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50"
			>
				{cSubmitting ? m.common_creating() : m.admin_users_create()}
			</button>
		</div>
	</form>
</Modal>

<!-- Invite user modal -->
<Modal
	open={inviteOpen}
	onclose={() => {
		inviteOpen = false;
		resetInvite();
	}}
	maxWidth={480}
>
	<form onsubmit={submitInvite}>
		<div class="flex items-center border-b border-border px-5 pt-4 pb-3">
			<div>
				<div class="text-[12px] tracking-[0.08em] text-text-4 uppercase">{m.admin_workspace()}</div>
				<div class="text-[15px] font-semibold">{m.admin_users_invite_title()}</div>
			</div>
			<button
				type="button"
				class="ml-auto grid h-8 w-8 place-items-center rounded-lg text-text-3 hover:bg-surface hover:text-text"
				onclick={() => {
					inviteOpen = false;
					resetInvite();
				}}
				aria-label={m.common_close()}
			>
				<Icon name="x" size={15} />
			</button>
		</div>
		<div class="space-y-4 p-5">
			<div>
				<label for="i-name" class="mb-1.5 block text-[12px] tracking-[0.06em] text-text-4 uppercase"
					>{m.admin_name()}</label
				>
				<input
					id="i-name"
					bind:value={iName}
					required
					type="text"
					placeholder={m.admin_users_name_placeholder()}
					class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-[14px] outline-none focus:border-border-strong"
				/>
			</div>
			<div>
				<label
					for="i-email"
					class="mb-1.5 block text-[12px] tracking-[0.06em] text-text-4 uppercase"
					>{m.admin_users_email()}</label
				>
				<input
					id="i-email"
					bind:value={iEmail}
					required
					type="email"
					placeholder={m.admin_users_email_placeholder()}
					class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-[14px] outline-none focus:border-border-strong"
				/>
			</div>
			{@render orgRolePicker({
				selectedOrg: iSelectedOrg,
				orgId: iOrgId,
				orgRole: iOrgRole,
				roleOptions: iRoleOptions,
				pop: iPop,
				onTogglePop: (w) => (iPop = iPop === w ? null : w),
				onClosePop: () => (iPop = null),
				onPickOrg: pickInviteOrg,
				onPickRole: (r) => {
					iOrgRole = r;
					iPop = null;
				}
			})}
			<p class="text-[13px] leading-relaxed text-text-3">
				{m.admin_users_invite_note()}
			</p>
			{#if iError}
				<div
					class="rounded-lg border border-prio-urgent/35 bg-prio-urgent/8 px-3 py-2 text-[14px] text-accent"
				>
					{iError}
				</div>
			{/if}
		</div>
		<div
			class="flex items-center justify-end gap-2 rounded-b-2xl border-t border-border bg-bg/40 px-5 py-3"
		>
			<Button
				variant="default"
				size="sm"
				onclick={() => {
					inviteOpen = false;
					resetInvite();
				}}
			>
				{m.common_cancel()}
			</Button>
			<button
				type="submit"
				disabled={iSubmitting}
				class="inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-accent px-[12px] py-[8px] text-[14px] font-medium text-white shadow-btn transition-[background,border-color,transform] duration-150 hover:bg-accent-strong active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50"
			>
				{iSubmitting ? m.admin_users_sending() : m.admin_users_send_invite()}
			</button>
		</div>
	</form>
</Modal>
