<script lang="ts">
	import Topbar from '$lib/components/shell/Topbar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Button from '$lib/components/Button.svelte';
	import IconButton from '$lib/components/IconButton.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Drawer from '$lib/components/Drawer.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { TRACKR_USERS, USER_ROLES, USER_STATUS, USER_TEAMS } from '$lib/data';
	import type { User } from '$lib/types';

	type StatusFilter = 'all' | 'active' | 'invited' | 'disabled';
	let filter = $state<StatusFilter>('all');
	let search = $state('');
	let selected = $state<User | null>(null);
	let inviteOpen = $state(false);

	let users = $derived.by(() => {
		let list = TRACKR_USERS;
		if (filter !== 'all') list = list.filter((u) => u.status === filter);
		if (search) {
			const q = search.toLowerCase();
			list = list.filter(
				(u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
			);
		}
		return list;
	});

	const counts = {
		all: TRACKR_USERS.length,
		active: TRACKR_USERS.filter((u) => u.status === 'active').length,
		invited: TRACKR_USERS.filter((u) => u.status === 'invited').length,
		disabled: TRACKR_USERS.filter((u) => u.status === 'disabled').length
	};

	const tabs: { id: StatusFilter; label: string }[] = [
		{ id: 'all', label: 'All' },
		{ id: 'active', label: 'Active' },
		{ id: 'invited', label: 'Invited' },
		{ id: 'disabled', label: 'Disabled' }
	];
</script>

<svelte:head><title>Trackr · User Management</title></svelte:head>

<Topbar crumbs={[{ label: 'Trackr Workspace', href: '/tasks' }, { label: 'User Management' }]} />

<div class="flex-1 min-h-0 overflow-y-auto">
	<div class="px-6 py-6">
		<div class="flex items-end gap-4 mb-6">
			<div>
				<h1 class="text-[26px] font-semibold tracking-[-0.014em]">User Management</h1>
				<p class="text-[12.5px] text-text-3 mt-1">
					{counts.all} users · {counts.active} active · {counts.invited} pending invites
				</p>
			</div>
			<div class="ml-auto flex items-center gap-2">
				<Button variant="default" size="sm"><Icon name="link" size={13} /> Invite link</Button>
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

		<div class="bg-bg-elev border border-border rounded-2xl overflow-hidden">
			<div
				class="grid items-center gap-3 px-5 h-9 text-[11px] uppercase tracking-[0.08em] text-text-4 border-b border-border"
				style:grid-template-columns="2fr 1fr 1fr 1fr 1fr 1fr 36px"
			>
				<span>User</span>
				<span>Role</span>
				<span>Team</span>
				<span>Status</span>
				<span>Last active</span>
				<span>Joined</span>
				<span></span>
			</div>
			{#each users as u (u.id)}
				{@const role = USER_ROLES.find((r) => r.id === u.role)!}
				{@const status = USER_STATUS[u.status]}
				<button
					type="button"
					onclick={() => (selected = u)}
					class="grid items-center gap-3 w-full px-5 py-2.5 border-b border-border/40 last:border-b-0 hover:bg-[var(--row-hover)] transition-colors text-[13px] text-left {u.status === 'disabled' ? 'opacity-55 hover:opacity-100' : ''}"
					style:grid-template-columns="2fr 1fr 1fr 1fr 1fr 1fr 36px"
				>
					<span class="flex items-center gap-2.5 min-w-0">
						<Avatar user={u} size={28} />
						<span class="min-w-0">
							<span class="block font-medium text-text truncate">{u.name}</span>
							<span class="block text-[11.5px] text-text-3 truncate font-mono">{u.email}</span>
						</span>
					</span>
					<span class="flex items-center gap-1.5">
						<span class="w-1.5 h-1.5 rounded-full" style:background={role.color}></span>
						<span style:color={role.color}>{role.label}</span>
					</span>
					<span class="text-text-2">{u.team}</span>
					<span>
						<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px]" style:background={status.color + '24'} style:color={status.color}>
							<span class="w-1.5 h-1.5 rounded-full" style:background={status.color}></span>
							{status.label}
						</span>
					</span>
					<span class="text-text-3">{u.lastSeen}</span>
					<span class="text-text-3 font-mono text-[12px]">{u.joinedAt}</span>
					<span class="opacity-0 group-hover:opacity-100 text-text-3"><Icon name="chevron-r" size={12} /></span>
				</button>
			{/each}
		</div>
	</div>
</div>

<!-- User detail drawer -->
<Drawer open={!!selected} onclose={() => (selected = null)} width={420}>
	{#if selected}
		{@const sel = selected}
		{@const role = USER_ROLES.find((r) => r.id === sel.role)!}
		{@const status = USER_STATUS[sel.status]}
		<div class="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-border">
			<span class="font-mono text-[10.5px] uppercase tracking-[0.08em] text-text-4">User</span>
			<div class="ml-auto flex items-center gap-1">
				<IconButton size={28} ariaLabel="Copy link"><Icon name="link" size={14} /></IconButton>
				<IconButton size={28} ariaLabel="Close" onclick={() => (selected = null)}><Icon name="x" size={14} /></IconButton>
			</div>
		</div>
		<div class="flex-1 overflow-y-auto px-5 py-5">
			<div class="flex items-center gap-3 mb-5">
				<Avatar user={sel} size={56} />
				<div class="min-w-0">
					<div class="text-[18px] font-semibold tracking-[-0.01em] text-text truncate">{sel.name}</div>
					<div class="text-[12.5px] text-text-3 font-mono truncate">{sel.email}</div>
				</div>
			</div>

			<div class="grid grid-cols-2 gap-y-3 gap-x-4 text-[12.5px] mb-6">
				<div class="text-text-4">Role</div>
				<div class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full" style:background={role.color}></span><span style:color={role.color}>{role.label}</span></div>
				<div class="text-text-4">Team</div>
				<div>{sel.team}</div>
				<div class="text-text-4">Status</div>
				<div class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full" style:background={status.color}></span><span style:color={status.color}>{status.label}</span></div>
				<div class="text-text-4">2FA</div>
				<div>{sel.mfa ? 'Enabled' : 'Disabled'}</div>
				<div class="text-text-4">Joined</div>
				<div class="font-mono">{sel.joinedAt}</div>
				<div class="text-text-4">Last active</div>
				<div>{sel.lastSeen}</div>
			</div>

			<div class="mb-6">
				<div class="text-[10.5px] uppercase tracking-[0.08em] text-text-4 mb-2">Permissions</div>
				<div class="text-[12.5px] text-text-2 p-3 rounded-lg bg-surface border border-border leading-relaxed">
					{role.perm}
				</div>
				<a href="/admin/roles" class="text-[12px] text-accent hover:underline mt-2 inline-block">Manage roles →</a>
			</div>

			<div class="mb-6">
				<div class="text-[10.5px] uppercase tracking-[0.08em] text-text-4 mb-2">Workload</div>
				<div class="grid grid-cols-2 gap-3">
					<div class="p-3 rounded-lg bg-surface border border-border">
						<div class="text-[10.5px] uppercase tracking-[0.06em] text-text-4">Open tasks</div>
						<div class="font-mono text-[20px] font-semibold mt-0.5">{sel.tasks}</div>
					</div>
					<div class="p-3 rounded-lg bg-surface border border-border">
						<div class="text-[10.5px] uppercase tracking-[0.06em] text-text-4">Projects</div>
						<div class="font-mono text-[20px] font-semibold mt-0.5">{sel.role === 'owner' ? 4 : 2}</div>
					</div>
				</div>
			</div>

			<div class="flex flex-col gap-2">
				<Button variant="default" size="sm"><Icon name="msg" size={13} /> Send DM</Button>
				<Button variant="default" size="sm"><Icon name="shield" size={13} /> Reset password</Button>
				{#if sel.status === 'invited'}
					<Button variant="default" size="sm"><Icon name="plus" size={13} /> Resend invite</Button>
				{:else if sel.status === 'disabled'}
					<Button variant="primary" size="sm"><Icon name="check" size={13} /> Re-activate</Button>
				{:else}
					<Button variant="default" size="sm"><Icon name="x" size={13} /> Disable</Button>
				{/if}
			</div>
		</div>
	{/if}
</Drawer>

<!-- Invite user modal -->
<Modal open={inviteOpen} onclose={() => (inviteOpen = false)} maxWidth={480}>
	<div class="flex items-center px-5 pt-4 pb-3 border-b border-border">
		<div>
			<div class="text-[11px] uppercase tracking-[0.08em] text-text-4">Workspace</div>
			<div class="text-[15px] font-semibold">Invite a user</div>
		</div>
		<button class="ml-auto w-8 h-8 grid place-items-center rounded-lg text-text-3 hover:text-text hover:bg-surface" onclick={() => (inviteOpen = false)}>
			<Icon name="x" size={14} />
		</button>
	</div>
	<div class="p-5 space-y-4">
		<div>
			<label for="invite-email" class="text-[11.5px] uppercase tracking-[0.06em] text-text-4 block mb-1.5">Email</label>
			<input id="invite-email" type="email" placeholder="name@example.com" class="w-full bg-surface border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:border-border-strong" />
		</div>
		<div class="grid grid-cols-2 gap-3">
			<div>
				<label for="invite-role" class="text-[11.5px] uppercase tracking-[0.06em] text-text-4 block mb-1.5">Role</label>
				<select id="invite-role" class="w-full bg-surface border border-border rounded-lg px-3 py-2 text-[13px]">
					{#each USER_ROLES.filter((r) => r.id !== 'owner') as r (r.id)}<option value={r.id}>{r.label}</option>{/each}
				</select>
			</div>
			<div>
				<label for="invite-team" class="text-[11.5px] uppercase tracking-[0.06em] text-text-4 block mb-1.5">Team</label>
				<select id="invite-team" class="w-full bg-surface border border-border rounded-lg px-3 py-2 text-[13px]">
					{#each USER_TEAMS as t (t)}<option value={t}>{t}</option>{/each}
				</select>
			</div>
		</div>
		<p class="text-[12px] text-text-3 leading-relaxed">
			Members can create and edit tasks in their assigned projects. Promote them later if they need broader access.
		</p>
	</div>
	<div class="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-bg/40 rounded-b-2xl">
		<Button variant="default" size="sm" onclick={() => (inviteOpen = false)}>Cancel</Button>
		<Button variant="primary" size="sm">Send invite</Button>
	</div>
</Modal>
