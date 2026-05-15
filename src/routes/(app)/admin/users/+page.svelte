<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import type { ActionResult } from '@sveltejs/kit';
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Button from '$lib/components/Button.svelte';
	import IconButton from '$lib/components/IconButton.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { confirm as uiConfirm } from '$lib/components/confirm.svelte';
	import { ROLE_META, type Role } from '$lib/admin-meta';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type UserRow = PageData['users'][number];
	type InvitationRow = PageData['invitations'][number];

	type StatusFilter = 'all' | 'active' | 'banned';
	let filter = $state<StatusFilter>('all');
	let search = $state('');
	let selected = $state<UserRow | null>(null);
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
				(u) =>
					(u.name?.toLowerCase().includes(q) ?? false) || u.email.toLowerCase().includes(q)
			);
		}
		return list;
	});

	const tabs: { id: StatusFilter; label: string }[] = [
		{ id: 'all', label: 'All' },
		{ id: 'active', label: 'Active' },
		{ id: 'banned', label: 'Banned' }
	];

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
		if (ms <= 0) return 'expired';
		const days = Math.round(ms / (24 * 60 * 60 * 1000));
		if (days >= 1) return `expires in ${days} day${days === 1 ? '' : 's'}`;
		return 'expires in <1 day';
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
			const msg = (result.data as { message?: string } | undefined)?.message ?? 'Action failed.';
			throw new Error(msg);
		}
		if (result.type === 'error') {
			throw new Error(result.error?.message ?? 'Action failed.');
		}
		await invalidateAll();
	}

	async function handleResetPassword(u: UserRow) {
		const key = `reset:${u.id}`;
		if (pendingAction === key) return;
		pendingAction = key;
		try {
			await postAction('sendPasswordReset', { userId: u.id });
			showToast('ok', `Reset link sent to ${u.email}.`);
		} catch (e) {
			showToast('err', e instanceof Error ? e.message : 'Failed.');
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
			showToast('err', e instanceof Error ? e.message : 'Failed.');
			pendingAction = null;
		}
	}

	async function handleDelete(u: UserRow) {
		const ok = await uiConfirm({
			title: 'Delete user',
			message: `${u.email} will be permanently removed. This cannot be undone.`,
			confirmLabel: 'Delete user',
			cancelLabel: 'Keep',
			tone: 'danger'
		});
		if (!ok) return;
		const key = `del:${u.id}`;
		if (pendingAction === key) return;
		pendingAction = key;
		try {
			await postAction('deleteUser', { userId: u.id });
			showToast('ok', `${u.email} deleted.`);
			selected = null;
		} catch (e) {
			showToast('err', e instanceof Error ? e.message : 'Failed.');
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
			showToast('ok', `Invitation resent to ${inv.email}.`);
		} catch (e) {
			showToast('err', e instanceof Error ? e.message : 'Failed.');
		} finally {
			pendingAction = null;
		}
	}

	async function handleRevoke(inv: InvitationRow) {
		const ok = await uiConfirm({
			title: 'Revoke invitation',
			message: `The invitation link for ${inv.email} will stop working.`,
			confirmLabel: 'Revoke',
			cancelLabel: 'Keep',
			tone: 'warn'
		});
		if (!ok) return;
		const key = `revoke:${inv.id}`;
		if (pendingAction === key) return;
		pendingAction = key;
		try {
			await postAction('revokeInvitation', { id: inv.id });
			showToast('ok', `Invitation for ${inv.email} revoked.`);
		} catch (e) {
			showToast('err', e instanceof Error ? e.message : 'Failed.');
		} finally {
			pendingAction = null;
		}
	}

	// Create user modal state
	let cName = $state('');
	let cEmail = $state('');
	let cPassword = $state('');
	let cRole = $state<Role>('user');
	let cSubmitting = $state(false);
	let cError = $state<string | null>(null);

	function resetCreate() {
		cName = '';
		cEmail = '';
		cPassword = '';
		cRole = 'user';
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
			cError = 'Password must be at least 8 characters.';
			return;
		}
		cSubmitting = true;
		try {
			await postAction('createUser', {
				name: cName,
				email: cEmail,
				password: cPassword,
				role: cRole
			});
			showToast('ok', `Created ${cEmail}.`);
			resetCreate();
			createOpen = false;
		} catch (err) {
			cError = err instanceof Error ? err.message : 'Failed to create user.';
		} finally {
			cSubmitting = false;
		}
	}

	// Invite user modal state
	let iName = $state('');
	let iEmail = $state('');
	let iRole = $state<Role>('user');
	let iSubmitting = $state(false);
	let iError = $state<string | null>(null);

	function resetInvite() {
		iName = '';
		iEmail = '';
		iRole = 'user';
		iError = null;
	}

	async function submitInvite(e: Event) {
		e.preventDefault();
		iError = null;
		iSubmitting = true;
		try {
			await postAction('inviteUser', { name: iName, email: iEmail, role: iRole });
			showToast('ok', `Invitation sent to ${iEmail}.`);
			resetInvite();
			inviteOpen = false;
		} catch (err) {
			iError = err instanceof Error ? err.message : 'Failed to send invitation.';
		} finally {
			iSubmitting = false;
		}
	}

	let showPassword = $state(false);

	const assignableRoles: Role[] = $derived(
		data.viewerIsSuperadmin ? ['user', 'admin', 'superadmin'] : ['user', 'admin']
	);
</script>

<svelte:head><title>Trackr · User Management</title></svelte:head>

<Topbar crumbs={[{ label: 'Trackr Workspace', href: '/tasks' }, { label: 'User Management' }]} />

<div class="flex-1 min-h-0 overflow-y-auto">
	<div class="px-6 py-6">
		<div class="flex items-end gap-4 mb-6">
			<div>
				<h1 class="text-[26px] font-semibold tracking-[-0.014em]">User Management</h1>
				<p class="text-[12.5px] text-text-3 mt-1">
					{counts.all} users · {counts.active} active · {counts.invited} pending invite{counts.invited === 1 ? '' : 's'}
				</p>
			</div>
			<div class="ml-auto flex items-center gap-2">
				<Button variant="default" size="sm" onclick={() => (createOpen = true)}>
					<Icon name="user" size={13} /> Create user
				</Button>
				<Button variant="primary" size="sm" onclick={() => (inviteOpen = true)}>
					<Icon name="plus" size={13} /> Invite user
				</Button>
			</div>
		</div>

		<div class="flex items-center gap-2.5 mb-4">
			<div class="inline-flex items-center h-8 bg-surface border border-border rounded-lg p-0.5">
				{#each tabs as t (t.id)}
					<button
						type="button"
						onclick={() => (filter = t.id)}
						class="inline-flex items-center gap-1.5 px-2.5 h-full rounded-md text-[12.5px] transition-colors {filter === t.id ? 'bg-bg-elev text-text shadow-sm' : 'text-text-3 hover:text-text'}"
					>
						{t.label}
						<span class="font-mono text-[10.5px] text-text-3">
							{counts[t.id]}
						</span>
					</button>
				{/each}
			</div>
			<div class="ml-auto relative">
				<span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-3 pointer-events-none">
					<Icon name="search" size={13} />
				</span>
				<input
					type="text"
					bind:value={search}
					placeholder="Search by name or email…"
					class="h-8 pl-8 pr-3 rounded-lg bg-surface border border-border text-[12.5px] outline-none focus:border-border-strong w-64"
				/>
			</div>
		</div>

		{#if data.invitations.length > 0}
			<div class="mb-5">
				<div class="text-[10.5px] uppercase tracking-[0.08em] text-text-4 mb-2 px-1">
					Pending invitations · {data.invitations.length}
				</div>
				<div class="bg-bg-elev border border-border rounded-2xl overflow-hidden">
					{#each data.invitations as inv (inv.id)}
						{@const meta = ROLE_META[inv.role as Role] ?? ROLE_META.user}
						{@const expired = new Date(inv.expiresAt).getTime() < Date.now()}
						<div
							class="flex items-center gap-3 px-5 py-3 border-b border-border/40 last:border-b-0"
						>
							<span
								class="w-8 h-8 rounded-lg grid place-items-center bg-surface border border-border text-text-3"
							>
								<Icon name="msg" size={14} />
							</span>
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<span class="text-[13px] font-medium text-text truncate">{inv.email}</span>
									<span
										class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10.5px] font-medium"
										style:background={meta.color + '22'}
										style:color={meta.color}
									>
										<span class="w-1 h-1 rounded-full" style:background={meta.color}></span>
										{meta.label}
									</span>
								</div>
								<div class="text-[11.5px] text-text-3 mt-0.5">
									Invited as <span class="text-text-2">{inv.name}</span>
									{' · '}
									<span class={expired ? 'text-prio-urgent' : ''}>{fmtRelative(inv.expiresAt)}</span>
								</div>
							</div>
							<div class="flex items-center gap-1">
								<IconButton
									size={28}
									ariaLabel="Resend invitation"
									onclick={() => handleResend(inv)}
								>
									{#if pendingAction === `resend:${inv.id}`}
										<span
											class="w-3 h-3 rounded-full border-2 border-text-3 border-t-transparent animate-spin"
										></span>
									{:else}
										<Icon name="refresh" size={13} />
									{/if}
								</IconButton>
								<IconButton
									size={28}
									ariaLabel="Revoke invitation"
									onclick={() => handleRevoke(inv)}
								>
									<Icon name="x" size={13} />
								</IconButton>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<div class="bg-bg-elev border border-border rounded-2xl overflow-hidden">
			<div
				class="grid items-center gap-3 px-5 h-9 text-[11px] uppercase tracking-[0.08em] text-text-4 border-b border-border"
				style:grid-template-columns="2fr 1fr 1fr 1fr 36px"
			>
				<span>User</span>
				<span>Role</span>
				<span>Status</span>
				<span>Joined</span>
				<span></span>
			</div>
			{#if users.length === 0}
				<div class="px-5 py-10 text-center text-[12.5px] text-text-3">
					No users match your filters.
				</div>
			{/if}
			{#each users as u (u.id)}
				{@const meta = ROLE_META[(u.role ?? 'user') as Role] ?? ROLE_META.user}
				{@const banned = !!u.banned}
				{@const isSelf = u.id === data.currentUserId}
				<button
					type="button"
					onclick={() => (selected = u)}
					class="grid items-center gap-3 w-full px-5 py-2.5 border-b border-border/40 last:border-b-0 hover:bg-[var(--row-hover)] transition-colors text-[13px] text-left {banned ? 'opacity-55 hover:opacity-100' : ''}"
					style:grid-template-columns="2fr 1fr 1fr 1fr 36px"
				>
					<span class="flex items-center gap-2.5 min-w-0">
						<Avatar user={makeAvatar(u)} size={28} />
						<span class="min-w-0">
							<span class="block font-medium text-text truncate">
								{u.name ?? '—'}
								{#if isSelf}
									<span class="ml-1 text-[10.5px] font-mono text-text-4">(you)</span>
								{/if}
							</span>
							<span class="block text-[11.5px] text-text-3 truncate font-mono">{u.email}</span>
						</span>
					</span>
					<span class="flex items-center gap-1.5">
						<span class="w-1.5 h-1.5 rounded-full" style:background={meta.color}></span>
						<span style:color={meta.color}>{meta.label}</span>
					</span>
					<span>
						{#if banned}
							<span
								class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px]"
								style:background="rgba(239,79,94,0.16)"
								style:color="#ef4f5e"
							>
								<span class="w-1.5 h-1.5 rounded-full" style:background="#ef4f5e"></span>
								Banned
							</span>
						{:else}
							<span
								class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px]"
								style:background="rgba(127,200,169,0.16)"
								style:color="#7fc8a9"
							>
								<span class="w-1.5 h-1.5 rounded-full" style:background="#7fc8a9"></span>
								Active
							</span>
						{/if}
					</span>
					<span class="text-text-3 font-mono text-[12px]">{fmtDate(u.createdAt)}</span>
					<span class="text-text-3 grid place-items-center"><Icon name="chevron-r" size={12} /></span>
				</button>
			{/each}
		</div>
	</div>
</div>

<!-- Toast -->
{#if toast}
	<div
		class="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-3.5 py-2 rounded-lg border text-[13px] backdrop-blur-md shadow-lg"
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
		{@const canImpersonate = data.viewerIsSuperadmin && !isSelf && !banned}
		<div class="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-border">
			<span class="font-mono text-[10.5px] uppercase tracking-[0.08em] text-text-4">User</span>
			<div class="ml-auto flex items-center gap-1">
				<IconButton size={28} ariaLabel="Close" onclick={() => (selected = null)}>
					<Icon name="x" size={14} />
				</IconButton>
			</div>
		</div>
		<div class="flex-1 overflow-y-auto px-5 py-5">
			<div class="flex items-center gap-3 mb-5">
				<Avatar user={makeAvatar(sel)} size={56} />
				<div class="min-w-0">
					<div class="text-[18px] font-semibold tracking-[-0.01em] text-text truncate">
						{sel.name ?? '—'}
						{#if isSelf}
							<span class="ml-1 text-[12px] font-mono text-text-4">(you)</span>
						{/if}
					</div>
					<div class="text-[12.5px] text-text-3 font-mono truncate">{sel.email}</div>
				</div>
			</div>

			<div class="grid grid-cols-[auto_1fr] gap-y-3 gap-x-4 text-[12.5px] mb-6">
				<div class="text-text-4">Role</div>
				<div class="flex items-center gap-1.5">
					<span class="w-1.5 h-1.5 rounded-full" style:background={meta.color}></span>
					<span style:color={meta.color}>{meta.label}</span>
				</div>
				<div class="text-text-4">Status</div>
				<div>
					{#if banned}
						<span style:color="#ef4f5e">Banned</span>
					{:else}
						<span style:color="#7fc8a9">Active</span>
					{/if}
				</div>
				<div class="text-text-4">Joined</div>
				<div class="font-mono">{fmtDate(sel.createdAt)}</div>
				<div class="text-text-4">ID</div>
				<div class="font-mono text-text-3 truncate">{sel.id}</div>
			</div>

			<div class="flex flex-col gap-2">
				<Button
					variant="default"
					size="sm"
					disabled={pendingAction === `reset:${sel.id}`}
					onclick={() => handleResetPassword(sel)}
				>
					<Icon name="shield" size={13} />
					{pendingAction === `reset:${sel.id}` ? 'Sending…' : 'Send password reset'}
				</Button>
				{#if canImpersonate}
					<Button
						variant="default"
						size="sm"
						disabled={pendingAction === `imp:${sel.id}`}
						onclick={() => handleImpersonate(sel)}
					>
						<Icon name="user" size={13} />
						{pendingAction === `imp:${sel.id}` ? 'Starting…' : 'Impersonate'}
					</Button>
				{/if}
				{#if !isSelf}
					<Button
						variant="default"
						size="sm"
						disabled={pendingAction === `del:${sel.id}`}
						onclick={() => handleDelete(sel)}
					>
						<Icon name="x" size={13} />
						{pendingAction === `del:${sel.id}` ? 'Deleting…' : 'Delete user'}
					</Button>
				{/if}
			</div>
		</div>
	{/if}
</Drawer>

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
		<div class="flex items-center px-5 pt-4 pb-3 border-b border-border">
			<div>
				<div class="text-[11px] uppercase tracking-[0.08em] text-text-4">Workspace</div>
				<div class="text-[15px] font-semibold">Create a user</div>
			</div>
			<button
				type="button"
				class="ml-auto w-8 h-8 grid place-items-center rounded-lg text-text-3 hover:text-text hover:bg-surface"
				onclick={() => {
					createOpen = false;
					resetCreate();
				}}
				aria-label="Close"
			>
				<Icon name="x" size={14} />
			</button>
		</div>
		<div class="p-5 space-y-4">
			<div>
				<label for="c-name" class="text-[11.5px] uppercase tracking-[0.06em] text-text-4 block mb-1.5">Name</label>
				<input
					id="c-name"
					bind:value={cName}
					required
					type="text"
					placeholder="Jane Doe"
					class="w-full bg-surface border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:border-border-strong"
				/>
			</div>
			<div>
				<label for="c-email" class="text-[11.5px] uppercase tracking-[0.06em] text-text-4 block mb-1.5">Email</label>
				<input
					id="c-email"
					bind:value={cEmail}
					required
					type="email"
					placeholder="name@example.com"
					class="w-full bg-surface border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:border-border-strong"
				/>
			</div>
			<div>
				<label for="c-password" class="text-[11.5px] uppercase tracking-[0.06em] text-text-4 block mb-1.5">Initial password</label>
				<div class="relative">
					<input
						id="c-password"
						bind:value={cPassword}
						required
						minlength={8}
						type={showPassword ? 'text' : 'password'}
						placeholder="At least 8 characters"
						class="w-full bg-surface border border-border rounded-lg pl-3 pr-20 py-2 text-[13px] outline-none focus:border-border-strong font-mono"
					/>
					<div class="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
						<button
							type="button"
							onclick={() => (showPassword = !showPassword)}
							class="w-7 h-7 grid place-items-center rounded-md text-text-3 hover:text-text hover:bg-[var(--row-hover)]"
							aria-label={showPassword ? 'Hide password' : 'Show password'}
							tabindex={-1}
						>
							<Icon name={showPassword ? 'x' : 'user'} size={13} />
						</button>
						<button
							type="button"
							onclick={generatePassword}
							class="px-1.5 h-7 rounded-md text-[11px] font-medium text-text-3 hover:text-text hover:bg-[var(--row-hover)]"
							tabindex={-1}
						>
							Generate
						</button>
					</div>
				</div>
			</div>
			<div>
				<label for="c-role" class="text-[11.5px] uppercase tracking-[0.06em] text-text-4 block mb-1.5">Role</label>
				<select
					id="c-role"
					bind:value={cRole}
					class="w-full bg-surface border border-border rounded-lg px-3 py-2 text-[13px]"
				>
					{#each assignableRoles as r (r)}
						<option value={r}>{ROLE_META[r].label}</option>
					{/each}
				</select>
				<p class="text-[11.5px] text-text-3 mt-1.5">{ROLE_META[cRole].perm}</p>
			</div>
			{#if cError}
				<div
					class="rounded-lg border px-3 py-2 text-[12.5px]"
					style:border-color="rgba(239,79,94,0.35)"
					style:background="rgba(239,79,94,0.08)"
					style:color="#ef7a6d"
				>
					{cError}
				</div>
			{/if}
		</div>
		<div class="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-bg/40 rounded-b-2xl">
			<Button
				variant="default"
				size="sm"
				onclick={() => {
					createOpen = false;
					resetCreate();
				}}
			>
				Cancel
			</Button>
			<button
				type="submit"
				disabled={cSubmitting}
				class="inline-flex items-center gap-1.5 rounded-lg font-medium text-[13px] transition-[background,border-color,transform] duration-150 disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-[1px] px-[11px] py-[7px] bg-accent text-white border border-transparent hover:bg-accent-strong shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_4px_12px_rgba(239,122,109,0.25)]"
			>
				{cSubmitting ? 'Creating…' : 'Create user'}
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
		<div class="flex items-center px-5 pt-4 pb-3 border-b border-border">
			<div>
				<div class="text-[11px] uppercase tracking-[0.08em] text-text-4">Workspace</div>
				<div class="text-[15px] font-semibold">Invite a user</div>
			</div>
			<button
				type="button"
				class="ml-auto w-8 h-8 grid place-items-center rounded-lg text-text-3 hover:text-text hover:bg-surface"
				onclick={() => {
					inviteOpen = false;
					resetInvite();
				}}
				aria-label="Close"
			>
				<Icon name="x" size={14} />
			</button>
		</div>
		<div class="p-5 space-y-4">
			<div>
				<label for="i-name" class="text-[11.5px] uppercase tracking-[0.06em] text-text-4 block mb-1.5">Name</label>
				<input
					id="i-name"
					bind:value={iName}
					required
					type="text"
					placeholder="Jane Doe"
					class="w-full bg-surface border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:border-border-strong"
				/>
			</div>
			<div>
				<label for="i-email" class="text-[11.5px] uppercase tracking-[0.06em] text-text-4 block mb-1.5">Email</label>
				<input
					id="i-email"
					bind:value={iEmail}
					required
					type="email"
					placeholder="name@example.com"
					class="w-full bg-surface border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:border-border-strong"
				/>
			</div>
			<div>
				<label for="i-role" class="text-[11.5px] uppercase tracking-[0.06em] text-text-4 block mb-1.5">Role</label>
				<select
					id="i-role"
					bind:value={iRole}
					class="w-full bg-surface border border-border rounded-lg px-3 py-2 text-[13px]"
				>
					{#each assignableRoles as r (r)}
						<option value={r}>{ROLE_META[r].label}</option>
					{/each}
				</select>
				<p class="text-[11.5px] text-text-3 mt-1.5">{ROLE_META[iRole].perm}</p>
			</div>
			<p class="text-[12px] text-text-3 leading-relaxed">
				The invitee will receive an email with a link to set their password. The link expires in 7 days.
			</p>
			{#if iError}
				<div
					class="rounded-lg border px-3 py-2 text-[12.5px]"
					style:border-color="rgba(239,79,94,0.35)"
					style:background="rgba(239,79,94,0.08)"
					style:color="#ef7a6d"
				>
					{iError}
				</div>
			{/if}
		</div>
		<div class="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-bg/40 rounded-b-2xl">
			<Button
				variant="default"
				size="sm"
				onclick={() => {
					inviteOpen = false;
					resetInvite();
				}}
			>
				Cancel
			</Button>
			<button
				type="submit"
				disabled={iSubmitting}
				class="inline-flex items-center gap-1.5 rounded-lg font-medium text-[13px] transition-[background,border-color,transform] duration-150 disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-[1px] px-[11px] py-[7px] bg-accent text-white border border-transparent hover:bg-accent-strong shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_4px_12px_rgba(239,122,109,0.25)]"
			>
				{iSubmitting ? 'Sending…' : 'Send invite'}
			</button>
		</div>
	</form>
</Modal>
