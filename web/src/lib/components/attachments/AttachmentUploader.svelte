<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Icon from '../Icon.svelte';
	import AttachmentDropzone from './AttachmentDropzone.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import {
		selectStageable,
		type AttachmentDTO,
		type AttachmentEntityType
	} from '$lib/config/attachments';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		entityType: AttachmentEntityType;
		entityId: string;
		/** Called with each uploaded attachment; if omitted, falls back to invalidateAll. */
		onuploaded?: (attachment: AttachmentDTO) => void;
		label?: string;
	}

	let { entityType, entityId, onuploaded, label = m.attach_attach_files() }: Props = $props();

	let uploading = $state(false);
	let input = $state<HTMLInputElement>();

	async function uploadOne(file: File): Promise<boolean> {
		const form = new FormData();
		form.set('entityType', entityType);
		form.set('entityId', entityId);
		form.set('file', file);
		const res = await fetch('/api/attachments', { method: 'POST', body: form });
		if (!res.ok) {
			const body = (await res.json().catch(() => null)) as { message?: string } | null;
			showToast('err', body?.message ?? m.attach_upload_failed({ filename: file.name }));
			return false;
		}
		const body = (await res.json()) as { attachment: AttachmentDTO };
		onuploaded?.(body.attachment);
		return true;
	}

	async function upload(incoming: File[]) {
		const { accepted, errors } = selectStageable(incoming, 0);
		for (const err of errors) showToast('err', err);
		if (!accepted.length) return;
		uploading = true;
		let ok = 0;
		try {
			// Sequential keeps memory bounded and ordering stable.
			for (const file of accepted) {
				if (await uploadOne(file)) ok++;
			}
		} finally {
			uploading = false;
		}
		if (ok && !onuploaded) await invalidateAll();
	}

	function onPick(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		if (target.files?.length) upload(Array.from(target.files));
		target.value = '';
	}
</script>

<AttachmentDropzone onfiles={upload} disabled={uploading}>
	<button
		type="button"
		disabled={uploading}
		onclick={() => input?.click()}
		class="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border bg-surface px-2.5 py-1.5 text-[14px] text-text-2 transition-colors hover:border-border-strong hover:text-text disabled:opacity-60"
	>
		<Icon
			name={uploading ? 'refresh' : 'paperclip'}
			size={14}
			class={uploading ? 'animate-spin' : ''}
		/>
		<span>{uploading ? m.attach_uploading() : label}</span>
	</button>
	<input bind:this={input} type="file" multiple hidden onchange={onPick} />
</AttachmentDropzone>
