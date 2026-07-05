<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import type { ActionResult } from '@sveltejs/kit';
	import Icon from '$lib/components/Icon.svelte';
	import { confirm, prompt } from '$lib/components/confirm.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
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
		const name = await prompt({
			title: m.notes_template_rename_title(),
			placeholder: m.notes_template_name_placeholder(),
			defaultValue: current,
			confirmLabel: m.common_save(),
			cancelLabel: m.common_cancel()
		});
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

<div class="mx-auto max-w-[704px] px-8 py-10">
	<h1 class="mb-1 text-[20px] font-semibold text-text">{m.notes_templates_title()}</h1>
	<p class="mb-6 text-[14px] text-text-3">{m.notes_templates_hint()}</p>

	<div class="grid gap-1.5">
		{#each data.templates as t (t.id)}
			<div
				class="group flex items-center gap-3 rounded-xl border border-border/70 bg-bg-elev/40 px-3.5 py-3"
			>
				<span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface text-text-3">
					<Icon name={t.icon || 'file'} size={16} stroke={1.75} />
				</span>
				<span class="flex-1 truncate text-[14px] text-text-2">{t.name}</span>
				{#if t.isSystem}
					<span class="font-mono text-[12px] tracking-wide text-text-4 uppercase">
						{m.notes_template_built_in()}
					</span>
				{:else if t.mine}
					<button
						type="button"
						onclick={() => rename(t.id, t.name)}
						aria-label={m.notes_template_rename_prompt()}
						class="grid h-7 w-7 place-items-center rounded-md text-text-4 opacity-0 group-hover:opacity-100 hover:text-text-2"
					>
						<Icon name="settings" size={15} />
					</button>
					<button
						type="button"
						onclick={() => remove(t.id, t.name)}
						aria-label={m.common_delete()}
						class="grid h-7 w-7 place-items-center rounded-md text-text-4 opacity-0 group-hover:opacity-100 hover:text-accent"
					>
						<Icon name="trash" size={15} />
					</button>
				{/if}
			</div>
		{/each}
	</div>
</div>
