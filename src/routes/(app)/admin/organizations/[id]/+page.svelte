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
	import { POPOVER_IN } from '$lib/motion';
	import { showToast } from '$lib/toast.svelte';
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
	const DEFAULT_ROLE = $derived(
		data.org.isInternal ? 'org.staff' : 'org.member'
	);
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
					? (result.data as { message?: string } | undefined)?.message ?? 'Action failed.'
					: result.type === 'error'
						? result.error?.message ?? 'Action failed.'
						: 'Action failed.';
			showToast('err', msg);
		} catch {
			showToast('err', 'Network error.');
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
			title: 'Remove from organization',
			message: `${name} will no longer be a member of ${data.org.name}.`,
			confirmLabel: 'Remove',
			tone: 'danger'
		});
		if (!ok) return;
		await postMember('memberRemove', userId);
	}

	async function onArchive() {
		const ok = await uiConfirm({
			title: data.org.archivedAt ? 'Unarchive organization' : 'Archive organization',
			message: data.org.archivedAt
				? `Make "${data.org.name}" active again. Projects linked to it stay where they are.`
				: `"${data.org.name}" will be hidden from active lists. Its projects keep their org link.`,
			confirmLabel: data.org.archivedAt ? 'Unarchive' : 'Archive',
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

<svelte:head><title>Trackr · {data.org.name}</title></svelte:head>

<Topbar
	crumbs={[
		{ label: 'Trackr Workspace', href: '/tasks' },
		{ label: 'Organizations', href: '/admin/organizations' },
		{ label: data.org.name }
	]}
/>

<div class="flex-1 min-h-0 overflow-y-auto">
	<div class="px-6 py-6">
		<a
			href="/admin/organizations"
			class="inline-flex items-center gap-1.5 text-[12.5px] text-text-3 hover:text-text mb-5"
		>
			<Icon name="chevron-r" size={11} class="rotate-180" /> Organizations
		</a>

		<!-- hero -->
		<div class="flex items-start gap-4 mb-6">
			<div
				class="w-12 h-12 rounded-xl grid place-items-center text-white font-semibold text-[16px] shrink-0"
				style:background="linear-gradient(140deg, {data.org.color}, color-mix(in oklch, {data.org
					.color} 70%, #000) 85%)"
				style:box-shadow="0 1px 0 rgba(255,255,255,0.18) inset"
			>{initials(data.org.name)}</div>
			<div class="flex-1 min-w-0">
				<div class="flex items-center gap-2">
					<h1 class="text-[26px] font-semibold tracking-[-0.014em] text-text">{data.org.name}</h1>
					{#if data.org.archivedAt}
						<span
							class="text-[10.5px] uppercase tracking-[0.06em] px-1.5 py-0.5 rounded text-text-3"
							style:background="rgba(154,164,178,0.16)"
						>
							Archived
						</span>
					{/if}
				</div>
				<div class="text-[12.5px] text-text-3 font-mono mt-1">{data.org.slug}</div>
			</div>
			<div class="flex items-center gap-2">
				{#if !editing}
					<Button variant="default" size="sm" onclick={() => (editing = true)}>
						<Icon name="settings" size={13} /> Edit
					</Button>
				{/if}
				<Button variant="default" size="sm" onclick={onArchive}>
					<Icon name={data.org.archivedAt ? 'refresh' : 'x'} size={13} />
					{data.org.archivedAt ? 'Unarchive' : 'Archive'}
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
								(result.data as { message?: string } | undefined)?.message ?? 'Save failed.';
						} else if (result.type === 'error') {
							serverError = result.error?.message ?? 'Save failed.';
						}
					};
				}}
				class="bg-bg-elev border border-border rounded-2xl p-5 mb-6 space-y-4"
			>
				<div>
					<label
						for="o-name"
						class="text-[11px] uppercase tracking-[0.08em] text-text-4 block mb-1.5"
					>
						Name
					</label>
					<input
						id="o-name"
						name="name"
						bind:value={name}
						required
						class="w-full bg-surface border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:border-border-strong"
					/>
				</div>
				<div>
					<label
						for="o-slug"
						class="text-[11px] uppercase tracking-[0.08em] text-text-4 block mb-1.5"
					>
						Slug
					</label>
					<input
						id="o-slug"
						name="slug"
						bind:value={slug}
						class="w-full bg-surface border border-border rounded-lg px-3 py-2 text-[13px] font-mono outline-none focus:border-border-strong"
					/>
				</div>
				<div>
					<label
						for="o-desc"
						class="text-[11px] uppercase tracking-[0.08em] text-text-4 block mb-1.5"
					>
						Description
					</label>
					<textarea
						id="o-desc"
						name="description"
						bind:value={description}
						rows="3"
						class="w-full resize-none bg-surface border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:border-border-strong"
					></textarea>
				</div>
				<div>
					<div class="text-[11px] uppercase tracking-[0.08em] text-text-4 mb-2">Color</div>
					<div class="flex flex-wrap gap-1.5">
						{#each PALETTE as c (c)}
							<button
								type="button"
								onclick={() => (color = c)}
								aria-label="Pick color {c}"
								class="relative w-7 h-7 rounded-lg"
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
						class="rounded-lg border px-3 py-2 text-[12.5px]"
						style:border-color="rgba(239,79,94,0.35)"
						style:background="rgba(239,79,94,0.08)"
						style:color="#ef7a6d"
					>
						{serverError}
					</div>
				{/if}
				<div class="flex items-center gap-2 justify-end pt-1">
					<Button
						variant="default"
						onclick={() => {
							editing = false;
							serverError = null;
						}}
					>
						Cancel
					</Button>
					<button
						type="submit"
						disabled={saving || !name.trim()}
						class="inline-flex items-center gap-1.5 rounded-lg font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed px-[11px] py-[7px] bg-accent text-white border border-transparent hover:bg-accent-strong"
					>
						{saving ? 'Saving…' : 'Save changes'}
					</button>
				</div>
			</form>
		{:else if data.org.description}
			<div class="bg-bg-elev border border-border rounded-2xl p-4 mb-6">
				<div class="text-[11px] uppercase tracking-[0.08em] text-text-4 mb-1.5">About</div>
				<p class="text-[13.5px] text-text-2 leading-relaxed">{data.org.description}</p>
			</div>
		{/if}

		<!-- members -->
		<div class="bg-bg-elev border border-border rounded-2xl mb-5 relative">
			<div class="flex items-center gap-2.5 px-4 py-3 border-b border-border">
				<span class="text-[14px] font-semibold">Members</span>
				<span class="font-mono text-[11px] text-text-3">{data.members.length}</span>
				<div class="ml-auto relative">
					<Button
						variant="default"
						size="sm"
						onclick={() => {
							addingMember = !addingMember;
							memberSearch = '';
						}}
					>
						<Icon name="plus" size={13} /> Add member
					</Button>
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
									placeholder="Add a user…"
									class="flex-1 bg-transparent border-0 outline-none text-[13px] placeholder:text-text-3"
								/>
							</div>
							<div class="max-h-[280px] overflow-y-auto">
								{#each candidates as u (u.id)}
									<button
										type="button"
										onclick={() => addMember(u.id)}
										disabled={busyMember === `memberAdd:${u.id}`}
										class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text disabled:opacity-50"
									>
										<Avatar user={u} size={22} />
										<span class="min-w-0 flex-1">
											<span class="block text-[13px] truncate">{u.name}</span>
											<span class="block text-[11px] text-text-3 truncate font-mono">{u.email}</span>
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

			{#if data.members.length === 0}
				<div class="px-5 py-8 text-center text-[12.5px] text-text-3">
					No members yet — add someone above.
				</div>
			{:else}
				{#each data.members as m (m.id)}
					{@const role = (ROLES.includes(m.role as OrgRole) ? m.role : DEFAULT_ROLE) as OrgRole}
					{@const meta = ROLE_META[role] ?? { label: role, color: '#7c7c84' }}
					<div
						class="flex items-center gap-3 px-5 py-2.5 border-b border-border/40 last:border-b-0 text-[13px]"
					>
						<Avatar user={m} size={28} />
						<div class="min-w-0 flex-1">
							<div class="font-medium text-text truncate">{m.name}</div>
							<div class="text-[11.5px] text-text-3 truncate font-mono">{m.email}</div>
						</div>
						<div class="relative">
							<button
								type="button"
								onclick={() => (openRoleMenu = openRoleMenu === m.id ? null : m.id)}
								class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11.5px] font-medium hover:bg-surface"
								style:color={meta.color}
								style:background={meta.color + '22'}
							>
								<span class="w-1.5 h-1.5 rounded-full" style:background={meta.color}></span>
								{meta.label}
								<Icon name="chevron" size={10} />
							</button>
							{#if openRoleMenu === m.id}
								<div
									use:clickOutside={() => (openRoleMenu = null)}
									use:autoPlace
									in:fly={POPOVER_IN}
									class="absolute top-full mt-1.5 z-40 bg-bg-elev border border-border rounded-[10px] p-1.5 min-w-[140px]"
									style:box-shadow="var(--shadow-lg)"
								>
									{#each ROLES as r (r)}
										<button
											type="button"
											onclick={() => setRole(m.id, r)}
											class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text"
										>
											<span
												class="w-1.5 h-1.5 rounded-full"
												style:background={ROLE_META[r].color}
											></span>
											<span class="text-[12.5px]">{ROLE_META[r].label}</span>
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
							ariaLabel="Remove member"
							onclick={() => removeMember(m.id, m.name)}
						>
							{#if busyMember === `memberRemove:${m.id}`}
								<span
									class="w-3 h-3 rounded-full border-2 border-text-3 border-t-transparent animate-spin"
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
		<div class="bg-bg-elev border border-border rounded-2xl overflow-hidden">
			<div class="flex items-center gap-2.5 px-4 py-3 border-b border-border">
				<span class="text-[14px] font-semibold">Projects</span>
				<span class="font-mono text-[11px] text-text-3">{data.projects.length}</span>
			</div>
			{#if data.projects.length === 0}
				<EmptyState
					icon="folder"
					title="No projects linked to this organization yet"
					hint="Create a project from /projects and assign it to this org."
				/>
			{:else}
				{#each data.projects as p (p.id)}
					<a
						href="/projects/{p.id}"
						class="flex items-center gap-3 px-5 py-2.5 border-b border-border/40 last:border-b-0 hover:bg-[var(--row-hover)] transition-colors text-[13px]"
					>
						<span
							class="w-7 h-7 rounded-md grid place-items-center text-white font-semibold text-[12px] shrink-0"
							style:background="linear-gradient(140deg, {p.color}, color-mix(in oklch, {p.color} 70%, #000) 85%)"
						>{p.icon}</span>
						<span class="min-w-0 flex-1">
							<span class="block font-medium text-text truncate">{p.name}</span>
							<span class="block text-[11.5px] text-text-3 font-mono">{p.key}</span>
						</span>
						<span class="text-text-2 capitalize text-[12.5px]">{p.status.replace('_', ' ')}</span>
						<span class="text-text-3 grid place-items-center"
							><Icon name="chevron-r" size={12} /></span
						>
					</a>
				{/each}
			{/if}
		</div>
	</div>
</div>
