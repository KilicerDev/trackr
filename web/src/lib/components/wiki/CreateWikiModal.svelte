<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import type { ActionResult } from '@sveltejs/kit';
	import Modal from '../Modal.svelte';
	import Button from '../Button.svelte';
	import { showToast } from '$lib/toast.svelte';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		open: boolean;
		parentId: string | null;
		isFolder: boolean;
		onclose: () => void;
	}
	let { open = $bindable(), parentId, isFolder, onclose }: Props = $props();

	let title = $state('');
	let busy = $state(false);

	$effect(() => {
		if (open) {
			title = '';
			busy = false;
		}
	});

	async function submit(e: Event) {
		e.preventDefault();
		const t = title.trim();
		if (!t || busy) return;
		busy = true;
		try {
			const fd = new FormData();
			fd.append('title', t);
			fd.append('isFolder', isFolder ? 'true' : 'false');
			if (parentId) fd.append('parentId', parentId);

			const res = await fetch('/wiki?/create', {
				method: 'POST',
				body: fd,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result = deserialize(await res.text()) as ActionResult<
				{ id?: string },
				{ message?: string }
			>;

			if (result.type === 'success') {
				const id = result.data?.id;
				showToast('ok', isFolder ? m.wiki_toast_folder_created() : m.wiki_toast_page_created());
				await invalidateAll();
				onclose();
				if (id) await goto(`/wiki/${id}`);
			} else if (result.type === 'failure') {
				showToast('err', result.data?.message ?? m.wiki_toast_could_not_create());
				busy = false;
			} else {
				showToast('err', m.wiki_toast_could_not_create());
				busy = false;
			}
		} catch {
			showToast('err', m.wiki_toast_network_error());
			busy = false;
		}
	}
</script>

<Modal {open} {onclose} maxWidth={420}>
	<div class="px-5 pt-4 pb-3 border-b border-border">
		<h2 class="text-[15px] font-semibold tracking-[-0.005em]">
			{isFolder ? m.wiki_new_folder() : m.wiki_new_page()}
		</h2>
	</div>
	<form onsubmit={submit} class="px-5 py-4 space-y-4">
		<div>
			<label for="wiki-title" class="block text-[11.5px] text-text-3 mb-1.5">{m.wiki_title_label()}</label>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				id="wiki-title"
				bind:value={title}
				autofocus
				maxlength="120"
				placeholder={isFolder ? m.wiki_folder_placeholder() : m.wiki_page_placeholder()}
				class="w-full bg-surface border border-border rounded-lg px-3 py-2 outline-none focus:border-border-strong text-[13px]"
			/>
		</div>
		<div class="flex items-center justify-end gap-2 pt-1">
			<Button type="button" variant="ghost" onclick={onclose}>{m.common_cancel()}</Button>
			<Button type="submit" variant="primary" disabled={!title.trim() || busy}>
				{busy ? m.common_creating() : m.common_create()}
			</Button>
		</div>
	</form>
</Modal>
