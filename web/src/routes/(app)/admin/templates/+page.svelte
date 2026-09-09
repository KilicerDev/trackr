<script lang="ts">
	import { deserialize } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import type { ActionResult } from '@sveltejs/kit';
	import { showToast } from '$lib/stores/toast.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Popover from '$lib/components/Popover.svelte';
	import PopItem from '$lib/components/PopItem.svelte';
	import { confirm as uiConfirm, prompt as uiPrompt } from '$lib/components/confirm.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const cols = '2.2fr 0.7fr 0.9fr 1.1fr 0.5fr';

	let busy = $state<string | null>(null);
	let menuFor = $state<string | null>(null);

	async function post(action: string, fields: Record<string, string>): Promise<ActionResult> {
		const fd = new FormData();
		for (const [k, v] of Object.entries(fields)) fd.append(k, v);
		const res = await fetch(`?/${action}`, {
			method: 'POST',
			body: fd,
			headers: { 'x-sveltekit-action': 'true' }
		});
		return deserialize(await res.text());
	}

	function taskCountLabel(n: number): string {
		return n === 1 ? m.templates_tasks_count_one() : m.templates_tasks_count_other({ count: n });
	}

	// New template: ask for a name, create the draft, jump straight into the
	// editor so the next step (adding tasks) is right there.
	async function createTemplate() {
		const name = await uiPrompt({
			title: m.templates_new_prompt_title(),
			placeholder: m.templates_new_prompt_placeholder(),
			confirmLabel: m.templates_new(),
			icon: 'list'
		});
		if (!name?.trim()) return;
		busy = 'new';
		try {
			const result = await post('create', { name: name.trim() });
			if (result.type === 'success' && result.data?.id) {
				await goto(`/admin/templates/${result.data.id}`);
			} else {
				showToast('err', m.templates_action_error());
			}
		} catch {
			showToast('err', m.templates_action_error());
		} finally {
			busy = null;
		}
	}

	async function setStatus(t: PageData['templates'][number], status: 'draft' | 'published') {
		menuFor = null;
		busy = t.id;
		try {
			const result = await post('status', { id: t.id, status });
			if (result.type === 'success') {
				showToast(
					'ok',
					status === 'published' ? m.templates_published_toast() : m.templates_draft_toast()
				);
				await invalidateAll();
			} else showToast('err', m.templates_action_error());
		} catch {
			showToast('err', m.templates_action_error());
		} finally {
			busy = null;
		}
	}

	async function duplicate(t: PageData['templates'][number]) {
		menuFor = null;
		busy = t.id;
		try {
			const result = await post('duplicate', {
				id: t.id,
				name: m.templates_copy_suffix({ name: t.name })
			});
			if (result.type === 'success' && result.data?.id) {
				await goto(`/admin/templates/${result.data.id}`);
			} else showToast('err', m.templates_action_error());
		} catch {
			showToast('err', m.templates_action_error());
		} finally {
			busy = null;
		}
	}

	async function remove(t: PageData['templates'][number]) {
		menuFor = null;
		const ok = await uiConfirm({
			title: m.templates_delete_title(),
			message: m.templates_delete_message({ name: t.name, count: t.taskCount }),
			confirmLabel: m.common_delete(),
			tone: 'danger'
		});
		if (!ok) return;
		busy = t.id;
		try {
			const result = await post('delete', { id: t.id });
			if (result.type === 'success') {
				showToast('ok', m.templates_deleted_toast());
				await invalidateAll();
			} else showToast('err', m.templates_action_error());
		} catch {
			showToast('err', m.templates_action_error());
		} finally {
			busy = null;
		}
	}
</script>

<svelte:head><title>{m.templates_title()}</title></svelte:head>

<div class="mb-6 flex items-start gap-4">
	<div class="min-w-0 flex-1">
		<h1 class="text-[26px] font-semibold tracking-[-0.014em]">{m.templates_title()}</h1>
		<p class="mt-1 max-w-xl text-[14px] text-text-3">{m.templates_description()}</p>
	</div>
	<Button variant="primary" onclick={createTemplate} disabled={busy === 'new'}>
		<Icon name="plus" size={14} />
		{m.templates_new()}
	</Button>
</div>

<!-- No overflow clipping: the row menu pops out below the card edge. -->
<div class="rounded-2xl border border-border bg-bg-elev">
	{#if data.templates.length === 0}
		<EmptyState
			icon="list"
			title={m.templates_empty_title()}
			hint={m.templates_empty_description()}
		/>
	{:else}
		<div
			class="grid h-9 items-center gap-3 rounded-t-2xl border-b border-border px-5 text-[12px] tracking-[0.08em] text-text-4 uppercase"
			style:grid-template-columns={cols}
		>
			<span>{m.templates_col_template()}</span>
			<span>{m.templates_col_tasks()}</span>
			<span>{m.templates_col_status()}</span>
			<span>{m.templates_col_updated()}</span>
			<span></span>
		</div>
		{#each data.templates as t (t.id)}
			{@const published = t.status === 'published'}
			<div
				class="group/row relative grid items-center gap-3 border-b border-border/40 px-5 py-2.5 text-[14px] transition-colors last:rounded-b-2xl last:border-b-0 hover:bg-[var(--row-hover)] {busy ===
				t.id
					? 'opacity-60'
					: ''}"
				style:grid-template-columns={cols}
			>
				<a
					href="/admin/templates/{t.id}"
					class="flex min-w-0 items-center gap-3 after:absolute after:inset-0 after:content-['']"
				>
					<span
						class="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] text-[14px] font-semibold text-white"
						style:background="linear-gradient(140deg, {t.color}, color-mix(in oklch, {t.color} 70%, #000)
						85%)"
						style:box-shadow="var(--shadow-edge)"
					>
						{t.icon}
					</span>
					<span class="min-w-0">
						<span class="block truncate font-medium text-text">{t.name}</span>
						{#if t.description}
							<span class="block truncate text-[12px] text-text-3">{t.description}</span>
						{/if}
					</span>
				</a>
				<div class="font-mono text-[13px] text-text-3">{taskCountLabel(t.taskCount)}</div>
				<div>
					<span
						class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium {published
							? 'bg-emerald-500/15 text-emerald-400'
							: 'bg-amber-500/12 text-amber-300'}"
					>
						<span class="h-1.5 w-1.5 rounded-full {published ? 'bg-emerald-400' : 'bg-amber-300'}"
						></span>
						{published ? m.templates_status_published() : m.templates_status_draft()}
					</span>
				</div>
				<div class="font-mono text-[13px] text-text-3">{t.updatedAt}</div>
				<div class="relative z-10 flex justify-end">
					<button
						type="button"
						aria-label={m.templates_aria_actions()}
						onclick={() => (menuFor = menuFor === t.id ? null : t.id)}
						class="grid h-7 w-7 place-items-center rounded-lg text-text-3 transition-colors hover:bg-surface hover:text-text"
					>
						<Icon name="menu" size={14} />
					</button>
					<Popover open={menuFor === t.id} onclose={() => (menuFor = null)} align="right">
						{#if published}
							<PopItem onclick={() => setStatus(t, 'draft')}>
								<Icon name="pencil" size={14} class="text-text-3" />
								{m.templates_action_unpublish()}
							</PopItem>
						{:else}
							<PopItem onclick={() => setStatus(t, 'published')}>
								<Icon name="check" size={14} class="text-text-3" />
								{m.templates_action_publish()}
							</PopItem>
						{/if}
						<PopItem onclick={() => duplicate(t)}>
							<Icon name="file" size={14} class="text-text-3" />
							{m.templates_action_duplicate()}
						</PopItem>
						<div class="my-1 border-t border-border"></div>
						<PopItem onclick={() => remove(t)}>
							<Icon name="trash" size={14} class="text-[#ef4f5e]" />
							<span class="text-[#ef4f5e]">{m.common_delete()}</span>
						</PopItem>
					</Popover>
				</div>
			</div>
		{/each}
	{/if}
</div>
