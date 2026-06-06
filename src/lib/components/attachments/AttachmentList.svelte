<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Icon from '../Icon.svelte';
	import { confirm } from '../confirm.svelte';
	import { showToast } from '$lib/toast.svelte';
	import { formatBytes, type AttachmentDTO } from '$lib/attachments/config';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		attachments: AttachmentDTO[];
		/** Show delete buttons for all items. The server still re-checks permission. */
		canDelete?: boolean;
		/** If set, the uploader of an item may delete their own upload. */
		currentUserId?: string | null;
		/** Called after a successful delete; if omitted, falls back to invalidateAll. */
		ondeleted?: (id: string) => void;
	}

	let { attachments, canDelete = false, currentUserId = null, ondeleted }: Props = $props();

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
			<li class="group flex items-center gap-2.5 px-2 py-1.5 rounded-lg bg-surface border border-border">
				{#if att.hasThumbnail}
					<a
						href={`/api/attachments/${att.id}`}
						target="_blank"
						rel="noopener"
						class="shrink-0"
						aria-label={m.attach_open({ filename: att.filename })}
					>
						<img
							src={`/api/attachments/${att.id}?thumb`}
							alt={att.filename}
							loading="lazy"
							class="w-9 h-9 rounded-md object-cover border border-border"
						/>
					</a>
				{:else}
					<span class="w-9 h-9 grid place-items-center rounded-md bg-surface-2 text-text-3 shrink-0">
						<Icon name="file" size={16} />
					</span>
				{/if}
				<div class="min-w-0 flex-1">
					<div class="text-[12.5px] text-text truncate">{att.filename}</div>
					<div class="text-[11px] text-text-3">{formatBytes(att.sizeBytes)}</div>
				</div>
				<a
					href={`/api/attachments/${att.id}/download`}
					class="w-7 h-7 grid place-items-center rounded-md text-text-3 hover:text-text hover:bg-surface-2 transition-colors"
					aria-label={m.attach_download({ filename: att.filename })}
				>
					<Icon name="download" size={14} />
				</a>
				{#if deletable(att)}
					<button
						type="button"
						disabled={deleting === att.id}
						onclick={() => remove(att)}
						aria-label={m.attach_delete_file({ filename: att.filename })}
						class="w-7 h-7 grid place-items-center rounded-md text-text-3 hover:text-red-500 hover:bg-surface-2 transition-colors disabled:opacity-50"
					>
						<Icon name="trash" size={14} />
					</button>
				{/if}
			</li>
		{/each}
	</ul>
{/if}
