<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import type { ActionResult } from '@sveltejs/kit';
	import Icon from '$lib/components/Icon.svelte';
	import { confirm } from '$lib/components/confirm.svelte';
	import { showToast } from '$lib/toast.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	async function post(action: string, body: FormData): Promise<ActionResult> {
		const res = await fetch(`/notes/templates?/${action}`, {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		});
		return deserialize(await res.text()) as ActionResult;
	}

	async function rename(id: string, current: string) {
		const name = window.prompt(m.notes_template_rename_prompt(), current);
		if (!name?.trim() || name.trim() === current) return;
		const fd = new FormData();
		fd.set('id', id);
		fd.set('name', name.trim());
		const r = await post('rename', fd);
		if (r.type === 'success') {
			await invalidateAll();
		} else showToast('err', m.notes_toast_template_failed());
	}

	async function remove(id: string, name: string) {
		const ok = await confirm({
			title: m.notes_confirm_template_delete_title(),
			message: m.notes_confirm_template_delete_message({ name }),
			confirmLabel: m.common_delete(),
			tone: 'danger'
		});
		if (!ok) return;
		const fd = new FormData();
		fd.set('id', id);
		const r = await post('remove', fd);
		if (r.type === 'success') {
			showToast('ok', m.notes_toast_template_deleted());
			await invalidateAll();
		} else showToast('err', m.notes_toast_template_failed());
	}
</script>

<svelte:head><title>{m.notes_templates_title()}</title></svelte:head>

<div class="mx-auto max-w-[640px] px-8 py-10">
	<h1 class="text-[18px] font-semibold text-text mb-1">{m.notes_templates_title()}</h1>
	<p class="text-[13px] text-text-3 mb-6">{m.notes_templates_hint()}</p>

	<div class="grid gap-1.5">
		{#each data.templates as t (t.id)}
			<div
				class="group flex items-center gap-3 rounded-xl border border-border/70 bg-bg-elev/40 px-3.5 py-3"
			>
				<span class="grid place-items-center w-8 h-8 rounded-lg bg-surface text-text-3 shrink-0">
					<Icon name={t.icon || 'file'} size={15} stroke={1.75} />
				</span>
				<span class="flex-1 truncate text-[13.5px] text-text-2">{t.name}</span>
				{#if t.isSystem}
					<span class="text-[10.5px] font-mono uppercase tracking-wide text-text-4">
						{m.notes_template_built_in()}
					</span>
				{:else if t.mine}
					<button
						type="button"
						onclick={() => rename(t.id, t.name)}
						aria-label={m.notes_template_rename_prompt()}
						class="grid place-items-center w-7 h-7 rounded-md text-text-4 opacity-0 group-hover:opacity-100 hover:text-text-2"
					>
						<Icon name="settings" size={14} />
					</button>
					<button
						type="button"
						onclick={() => remove(t.id, t.name)}
						aria-label={m.common_delete()}
						class="grid place-items-center w-7 h-7 rounded-md text-text-4 opacity-0 group-hover:opacity-100 hover:text-accent"
					>
						<Icon name="trash" size={14} />
					</button>
				{/if}
			</div>
		{/each}
	</div>
</div>
