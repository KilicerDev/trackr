<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import type { ActionResult } from '@sveltejs/kit';
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import MentionText from '$lib/components/MentionText.svelte';
	import { confirm } from '$lib/components/confirm.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	// Shared by Settings → MCP → Guides (workspace layer) and /me/connections
	// (personal layer); the route owns the actions, this owns the form.
	export type EditorGuide = {
		id: string;
		slug: string;
		title: string;
		summary: string;
		body: string;
		sourceUrl: string | null;
		fetchedAt: Date | null;
		enabled: boolean;
		updatedAt: Date;
	};
	interface Props {
		guide: EditorGuide | null;
		bodyMax: number;
		/** Where the back link and post-delete navigation go. */
		backHref: string;
		backLabel: string;
	}
	let { guide, bodyMax, backHref, backLabel }: Props = $props();

	const isNew = $derived(guide === null);
	const fmt = new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' });

	// Local draft — persisted only on Save. Re-seeded when the route's guide changes.
	let title = $state('');
	let slug = $state('');
	let slugTouched = $state(false);
	let summary = $state('');
	let sourceUrl = $state('');
	let body = $state('');
	let enabled = $state(true);
	let fetched = $state(false);
	let fetchedAt = $state<Date | null>(null);
	let mode = $state<'edit' | 'preview'>('edit');
	let saving = $state(false);
	let fetching = $state(false);
	let formError = $state<string | null>(null);
	let fileInput = $state<HTMLInputElement>();
	let deleteForm = $state<HTMLFormElement>();

	$effect(() => {
		const g = guide;
		untrack(() => {
			title = g?.title ?? '';
			slug = g?.slug ?? '';
			slugTouched = !!g;
			summary = g?.summary ?? '';
			sourceUrl = g?.sourceUrl ?? '';
			body = g?.body ?? '';
			enabled = g?.enabled ?? true;
			fetchedAt = g?.fetchedAt ?? null;
			fetched = false;
			formError = null;
		});
	});

	$effect(() => {
		if (page.url.searchParams.get('created') === '1') {
			showToast('ok', m.mcp_guide_saved_toast());
			void goto(page.url.pathname, { replaceState: true, noScroll: true });
		}
	});

	function slugify(input: string): string {
		return input
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 64)
			.replace(/-+$/, '');
	}

	function onTitleInput() {
		if (!slugTouched) slug = slugify(title);
	}

	const overLimit = $derived(body.length > bodyMax);

	function failureMessage(result: ActionResult, fallback: string): string {
		return result.type === 'failure'
			? ((result.data as { message?: string } | undefined)?.message ?? fallback)
			: fallback;
	}

	type Submit = { action: URL };
	type Done = { result: ActionResult; update: () => Promise<void> };

	// One form, two submit buttons: the default `?/save`, and `?/fetch` via
	// `formaction` on the Import button (needs the form's other fields too).
	function onSubmit({ action }: Submit) {
		return action.search.includes('/fetch') ? onFetch() : onSave();
	}

	function onSave() {
		saving = true;
		formError = null;
		return async ({ result, update }: Done) => {
			saving = false;
			if (result.type === 'redirect') {
				await goto(result.location);
			} else if (result.type === 'success') {
				showToast('ok', m.mcp_guide_saved_toast());
				fetched = false;
				await invalidateAll();
			} else if (result.type === 'failure') {
				formError = failureMessage(result, m.mcp_guide_err_save_failed());
			} else {
				await update();
			}
		};
	}

	function onFetch() {
		fetching = true;
		formError = null;
		return async ({ result }: Done) => {
			fetching = false;
			if (result.type === 'success') {
				const d = (result.data as { fetched?: FetchedPayload } | undefined)?.fetched;
				if (d) {
					body = d.body;
					if (!title.trim() && d.title) title = d.title;
					if (d.slug && !slugTouched && !slug) slug = d.slug;
					fetched = true;
					fetchedAt = new Date();
					mode = 'edit';
					showToast(
						d.truncated ? 'err' : 'ok',
						d.truncated ? m.mcp_guide_truncated_toast() : m.mcp_guide_fetched_toast()
					);
				}
			} else if (result.type === 'failure') {
				formError = failureMessage(result, m.mcp_guide_err_save_failed());
			}
		};
	}

	type FetchedPayload = {
		body: string;
		title: string | null;
		slug: string | null;
		truncated: boolean;
	};

	async function onFile(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		if (file.size > bodyMax * 4) {
			showToast('err', m.mcp_guide_upload_too_large());
			return;
		}
		const text = await file.text();
		body = text.replace(/\r\n/g, '\n');
		if (!title.trim()) {
			const heading = /^#\s+(.+)$/m.exec(body);
			title = heading ? heading[1].trim() : file.name.replace(/\.(md|markdown|txt)$/i, '');
			onTitleInput();
		}
		fetched = false;
		mode = 'edit';
	}

	async function askDelete() {
		const ok = await confirm({
			title: m.mcp_guide_delete_title(),
			message: m.mcp_guide_delete_message({ title: title || slug }),
			confirmLabel: m.mcp_guide_delete(),
			tone: 'danger',
			icon: 'trash'
		});
		if (ok) deleteForm?.requestSubmit();
	}

	const inputCls =
		'w-full rounded-lg border border-border bg-surface px-3 py-2 text-[14px] text-text outline-none placeholder:text-text-3 focus:border-border-strong';
</script>

<svelte:head>
	<title
		>{isNew ? m.mcp_guide_new_title() : title || m.mcp_guide_edit_title()} · {m.settings_tab_mcp()}</title
	>
</svelte:head>

<div class="mb-5">
	<a
		href={backHref}
		class="inline-flex items-center gap-1 text-[13px] text-text-3 transition-colors hover:text-text"
	>
		<Icon name="chevron-r" size={13} class="rotate-180" />
		{backLabel}
	</a>
	<h1 class="mt-2 text-[26px] font-semibold tracking-[-0.014em]">
		{isNew ? m.mcp_guide_new_title() : m.mcp_guide_edit_title()}
	</h1>
	<p class="mt-1 max-w-xl text-[14px] text-text-3">{m.mcp_guides_hint()}</p>
</div>

<form method="post" action="?/save" use:enhance={onSubmit} class="flex flex-col gap-5">
	<input type="hidden" name="fetched" value={fetched ? '1' : '0'} />

	<section class="rounded-2xl border border-border bg-bg-elev p-5">
		<div class="grid gap-4 md:grid-cols-[1fr_260px]">
			<label class="block">
				<span class="mb-1.5 block text-[13px] font-medium text-text-2"
					>{m.mcp_guide_field_title()}</span
				>
				<input
					name="title"
					bind:value={title}
					oninput={onTitleInput}
					required
					maxlength="120"
					class={inputCls}
					placeholder={m.mcp_guide_field_title_placeholder()}
				/>
			</label>
			<label class="block">
				<span class="mb-1.5 block text-[13px] font-medium text-text-2"
					>{m.mcp_guide_field_slug()}</span
				>
				<input
					name="slug"
					bind:value={slug}
					oninput={() => (slugTouched = true)}
					maxlength="64"
					class="{inputCls} font-mono text-[13px]"
					placeholder="server-install"
				/>
			</label>
		</div>
		<p class="mt-1.5 text-[12px] text-text-4">
			{m.mcp_guide_field_slug_hint({ slug: slug || 'server-install' })}
		</p>

		<label class="mt-4 block">
			<span class="mb-1.5 block text-[13px] font-medium text-text-2"
				>{m.mcp_guide_field_summary()}</span
			>
			<input
				name="summary"
				bind:value={summary}
				maxlength="200"
				class={inputCls}
				placeholder={m.mcp_guide_field_summary_placeholder()}
			/>
			<span class="mt-1.5 block text-[12px] text-text-4">{m.mcp_guide_field_summary_hint()}</span>
		</label>

		<div class="mt-4">
			<span class="mb-1.5 block text-[13px] font-medium text-text-2"
				>{m.mcp_guide_field_source()}</span
			>
			<div class="flex items-center gap-2">
				<input
					name="sourceUrl"
					bind:value={sourceUrl}
					type="url"
					class="{inputCls} min-w-0 flex-1"
					placeholder="https://…"
				/>
				<button
					type="submit"
					formaction="?/fetch"
					disabled={fetching || !sourceUrl.trim()}
					class="inline-flex h-[38px] shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[13px] text-text-2 transition-colors hover:text-text disabled:opacity-50"
				>
					<Icon
						name={fetching ? 'refresh' : 'download'}
						size={13}
						class={fetching ? 'animate-spin' : ''}
					/>
					{fetchedAt ? m.mcp_guide_refresh() : m.mcp_guide_fetch()}
				</button>
			</div>
			<p class="mt-1.5 text-[12px] text-text-4">
				{m.mcp_guide_field_source_hint()}
				{#if fetchedAt}
					· {m.mcp_guide_fetched_at({ date: fmt.format(fetchedAt) })}
				{/if}
			</p>
		</div>

		<label class="mt-4 inline-flex cursor-pointer items-center gap-2 text-[14px] text-text-2">
			<input type="checkbox" name="enabled" bind:checked={enabled} class="h-4 w-4 accent-accent" />
			{m.mcp_guide_field_enabled()}
		</label>
	</section>

	<section class="rounded-2xl border border-border bg-bg-elev p-5">
		<div class="mb-3 flex flex-wrap items-center gap-2">
			<span class="text-[13px] font-medium text-text-2">{m.mcp_guide_field_body()}</span>
			<div class="ml-auto flex items-center gap-1 rounded-lg border border-border bg-surface p-0.5">
				{#each [{ id: 'edit', label: m.mcp_guide_edit() }, { id: 'preview', label: m.mcp_guide_preview() }] as tab (tab.id)}
					<button
						type="button"
						onclick={() => (mode = tab.id as 'edit' | 'preview')}
						class="rounded-md px-2.5 py-1 text-[13px] transition-colors {mode === tab.id
							? 'bg-bg-elev text-text shadow-sm'
							: 'text-text-3 hover:text-text'}"
					>
						{tab.label}
					</button>
				{/each}
			</div>
			<button
				type="button"
				onclick={() => fileInput?.click()}
				class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-[13px] text-text-2 transition-colors hover:text-text"
			>
				<Icon name="upload" size={13} />
				{m.mcp_guide_upload()}
			</button>
			<input
				bind:this={fileInput}
				type="file"
				accept=".md,.markdown,.txt,text/markdown,text/plain"
				class="hidden"
				onchange={onFile}
			/>
		</div>

		{#if mode === 'preview'}
			<div class="min-h-[420px] rounded-lg border border-border bg-surface px-4 py-3">
				{#if body.trim()}
					<MentionText text={body} flavor="document" class="text-[14px] leading-relaxed" />
				{:else}
					<p class="text-[13px] text-text-4">{m.mcp_guide_preview_empty()}</p>
				{/if}
			</div>
		{/if}
		<textarea
			name="body"
			bind:value={body}
			rows="24"
			spellcheck="false"
			class="min-h-[420px] w-full resize-y rounded-lg border border-border bg-surface px-3 py-2.5 font-mono text-[13px] leading-relaxed text-text outline-none placeholder:text-text-3 focus:border-border-strong"
			class:hidden={mode === 'preview'}
			placeholder={m.mcp_guide_body_placeholder()}
		></textarea>
		<p class="mt-2 text-[12px] {overLimit ? 'text-[#ef7a6d]' : 'text-text-4'}">
			{m.mcp_guide_body_chars({
				count: body.length.toLocaleString(getLocale()),
				max: bodyMax.toLocaleString(getLocale())
			})}
		</p>
	</section>

	{#if formError}
		<p
			class="rounded-lg border border-[#ef7a6d]/30 bg-[#ef7a6d]/5 px-3 py-2 text-[13px] text-[#ef7a6d]"
		>
			{formError}
		</p>
	{/if}

	<div class="flex items-center gap-2">
		{#if !isNew}
			<button
				type="button"
				onclick={askDelete}
				class="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[14px] text-text-3 transition-colors hover:bg-surface hover:text-[#ef7a6d]"
			>
				<Icon name="trash" size={14} />
				{m.mcp_guide_delete()}
			</button>
		{/if}
		<div class="ml-auto flex items-center gap-2">
			<a
				href={backHref}
				class="inline-flex items-center rounded-lg border border-border bg-surface px-[12px] py-[8px] text-[14px] font-medium text-text hover:bg-surface-2"
				>{m.common_cancel()}</a
			>
			<Button type="submit" variant="primary" disabled={saving || overLimit || !title.trim()}>
				{saving ? m.common_saving() : m.mcp_guide_save()}
			</Button>
		</div>
	</div>
</form>

{#if !isNew}
	<form bind:this={deleteForm} method="post" action="?/delete" use:enhance class="hidden"></form>
{/if}
