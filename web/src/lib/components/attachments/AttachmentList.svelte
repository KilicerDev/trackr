<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Icon from '../Icon.svelte';
	import { confirm } from '../confirm.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import { formatBytes, type AttachmentDTO } from '$lib/config/attachments';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		attachments: AttachmentDTO[];
		/** Show delete buttons for all items. The server still re-checks permission. */
		canDelete?: boolean;
		/** If set, the uploader of an item may delete their own upload. */
		currentUserId?: string | null;
		/** Called after a successful delete; if omitted, falls back to invalidateAll. */
		ondeleted?: (id: string) => void;
		/** The row's main link downloads the file instead of opening it inline. */
		downloadOnly?: boolean;
	}

	let {
		attachments,
		canDelete = false,
		currentUserId = null,
		ondeleted,
		downloadOnly = false
	}: Props = $props();

	let deleting = $state<string | null>(null);

	const deletable = (att: AttachmentDTO) =>
		canDelete || (!!currentUserId && att.uploadedBy === currentUserId);

	async function remove(att: AttachmentDTO) {
		const ok = await confirm({
			title: m.attach_delete_title(),
			message: m.attach_delete_message({ filename: att.filename }),
			confirmLabel: m.common_delete(),
			tone: 'danger',
			icon: 'trash'
		});
		if (!ok) return;
		deleting = att.id;
		try {
			const res = await fetch(`/api/attachments/${att.id}`, { method: 'DELETE' });
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { message?: string } | null;
				showToast('err', body?.message ?? m.attach_delete_failed());
				return;
			}
			showToast('ok', m.attach_deleted());
			if (ondeleted) ondeleted(att.id);
			else await invalidateAll();
		} finally {
			deleting = null;
		}
	}
</script>

{#if attachments.length}
	<ul class="flex flex-col gap-1.5">
		{#each attachments as att (att.id)}
			<li
				class="group relative flex items-center gap-2.5 rounded-lg border border-border bg-surface px-2 py-1.5 transition-colors hover:border-border-strong hover:bg-surface-2"
			>
				{#if att.hasThumbnail}
					<img
						src={`/api/attachments/${att.id}?thumb`}
						alt=""
						loading="lazy"
						class="h-9 w-9 shrink-0 rounded-md border border-border object-cover"
					/>
				{:else}
					<span
						class="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-surface-2 text-text-3 group-hover:bg-surface"
					>
						<Icon name="file" size={17} />
					</span>
				{/if}
				<div class="min-w-0 flex-1">
					<!-- Stretched link: the ::after overlay makes the whole row open the
					     file, while keeping a single link in the accessibility tree. The
					     action buttons below sit above it via `relative`. -->
					<a
						href={downloadOnly
							? `/api/attachments/${att.id}/download`
							: `/api/attachments/${att.id}`}
						target={downloadOnly ? undefined : '_blank'}
						rel="noopener"
						title={downloadOnly
							? m.attach_download({ filename: att.filename })
							: m.attach_open({ filename: att.filename })}
						class="block truncate text-[14px] text-text group-hover:underline after:absolute after:inset-0 after:rounded-lg"
					>
						{att.filename}
					</a>
					<div class="text-[12px] text-text-3">{formatBytes(att.sizeBytes)}</div>
				</div>
				<a
					href={`/api/attachments/${att.id}/download`}
					class="relative grid h-7 w-7 place-items-center rounded-md text-text-3 transition-colors hover:bg-border hover:text-text"
					aria-label={m.attach_download({ filename: att.filename })}
				>
					<Icon name="download" size={15} />
				</a>
				{#if deletable(att)}
					<button
						type="button"
						disabled={deleting === att.id}
						onclick={() => remove(att)}
						aria-label={m.attach_delete_file({ filename: att.filename })}
						class="relative grid h-7 w-7 place-items-center rounded-md text-text-3 transition-colors hover:bg-border hover:text-red-500 disabled:opacity-50"
					>
						<Icon name="trash" size={15} />
					</button>
				{/if}
			</li>
		{/each}
	</ul>
{/if}
