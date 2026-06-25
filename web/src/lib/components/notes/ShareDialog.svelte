<script lang="ts">
	import { browser } from '$app/environment';
	import { invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import type { ActionResult } from '@sveltejs/kit';
	import Icon from '$lib/components/Icon.svelte';
	import { confirm } from '$lib/components/confirm.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import { m } from '$lib/paraglide/messages';

	type Link = {
		id: string;
		token: string;
		role: string;
		revokedAt: Date | string | null;
	};

	let {
		open = $bindable(false),
		noteId,
		links
	}: { open: boolean; noteId: string; links: Link[] } = $props();

	let busy = $state(false);

	const activeLinks = $derived(links.filter((l) => !l.revokedAt));

	function shareUrl(token: string): string {
		const origin = browser ? location.origin : '';
		return `${origin}/notes/shared/${token}`;
	}

	async function post(action: string, body: FormData): Promise<ActionResult> {
		const res = await fetch(`/notes/${noteId}?/${action}`, {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		});
		return deserialize(await res.text()) as ActionResult;
	}

	async function createLink(role: 'read' | 'write') {
		if (busy) return;
		busy = true;
		const fd = new FormData();
		fd.set('role', role);
		const result = await post('share', fd);
		busy = false;
		if (result.type === 'success' && result.data?.token) {
			await navigator.clipboard?.writeText(shareUrl(result.data.token as string)).catch(() => {});
			showToast('ok', m.notes_toast_link_created());
			await invalidateAll();
		} else {
			showToast('err', m.notes_toast_share_failed());
		}
	}

	async function copyLink(token: string) {
		await navigator.clipboard?.writeText(shareUrl(token)).then(
			() => showToast('ok', m.notes_toast_link_copied()),
			() => showToast('err', m.notes_toast_copy_failed())
		);
	}

	async function revoke(id: string) {
		const ok = await confirm({
			title: m.notes_confirm_revoke_title(),
			message: m.notes_confirm_revoke_message(),
			confirmLabel: m.notes_revoke(),
			tone: 'danger'
		});
		if (!ok) return;
		const fd = new FormData();
		fd.set('linkId', id);
		const result = await post('revokeShare', fd);
		if (result.type === 'success') {
			showToast('ok', m.notes_toast_link_revoked());
			await invalidateAll();
		} else {
			showToast('err', m.notes_toast_revoke_failed());
		}
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget) open = false;
		}}
	>
		<div
			class="w-full max-w-[460px] rounded-2xl border border-border bg-bg-elev shadow-2xl"
			role="dialog"
			aria-modal="true"
		>
			<div class="flex items-center justify-between border-b border-border/70 px-5 py-4">
				<h2 class="text-[14px] font-semibold text-text">{m.notes_share_title()}</h2>
				<button
					type="button"
					onclick={() => (open = false)}
					class="grid h-7 w-7 place-items-center rounded-md text-text-3 hover:bg-surface-2 hover:text-text"
					aria-label={m.common_cancel()}
				>
					<Icon name="x" size={15} />
				</button>
			</div>

			<div class="grid gap-4 px-5 py-4">
				<p class="text-[13px] leading-relaxed text-text-3">{m.notes_share_hint()}</p>

				<div class="flex gap-2">
					<button
						type="button"
						disabled={busy}
						onclick={() => createLink('read')}
						class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-text-2 hover:border-border-strong disabled:opacity-50"
					>
						<Icon name="link" size={13} />
						{m.notes_share_create_read()}
					</button>
					<button
						type="button"
						disabled={busy}
						onclick={() => createLink('write')}
						class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-text-2 hover:border-border-strong disabled:opacity-50"
					>
						<Icon name="link" size={13} />
						{m.notes_share_create_write()}
					</button>
				</div>

				{#if activeLinks.length > 0}
					<div class="grid gap-1.5">
						{#each activeLinks as link (link.id)}
							<div class="flex items-center gap-2 rounded-lg bg-surface px-3 py-2">
								<span
									class="rounded px-1.5 py-0.5 font-mono text-[11px] tracking-wide uppercase {link.role ===
									'write'
										? 'bg-accent/15 text-accent'
										: 'bg-surface-2 text-text-3'}"
								>
									{link.role === 'write' ? m.notes_role_write() : m.notes_role_read()}
								</span>
								<span class="flex-1 truncate font-mono text-[12px] text-text-4">
									/notes/shared/{link.token.slice(0, 10)}…
								</span>
								<button
									type="button"
									onclick={() => copyLink(link.token)}
									aria-label={m.notes_toast_link_copied()}
									class="grid h-6 w-6 place-items-center rounded text-text-3 hover:bg-surface-2 hover:text-text"
								>
									<Icon name="paperclip" size={13} />
								</button>
								<button
									type="button"
									onclick={() => revoke(link.id)}
									aria-label={m.notes_revoke()}
									class="grid h-6 w-6 place-items-center rounded text-text-3 hover:bg-surface-2 hover:text-accent"
								>
									<Icon name="trash" size={13} />
								</button>
							</div>
						{/each}
					</div>
				{:else}
					<p class="py-2 text-center text-[12px] text-text-4">{m.notes_share_no_links()}</p>
				{/if}
			</div>
		</div>
	</div>
{/if}
