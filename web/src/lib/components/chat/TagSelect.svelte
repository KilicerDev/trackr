<script lang="ts">
	// A plain multi-select for tags: shows selected chips, and a button that
	// opens a checklist dropdown you click to toggle. A search box filters, and a
	// "Create" row appears for a novel name. The separate-and-clickable companion
	// to the inline `#` typing in the message composer.
	import { invalidateAll } from '$app/navigation';
	import Icon from '../Icon.svelte';
	import Popover from '../Popover.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import { m } from '$lib/paraglide/messages';
	import { createOrgTag } from './tags';
	import type { ChatTag } from '$lib/server/chat';

	interface Props {
		available: ChatTag[];
		selected: string[];
		orgId: string;
		onchange: (ids: string[]) => void;
		dropUp?: boolean;
	}
	let { available, selected, orgId, onchange, dropUp = false }: Props = $props();

	let open = $state(false);
	let query = $state('');
	let creating = $state(false);

	const byId = $derived(new Map(available.map((t) => [t.id, t])));
	const selectedTags = $derived(
		selected.map((id) => byId.get(id)).filter((t): t is ChatTag => !!t)
	);
	const filtered = $derived(
		available.filter((t) => t.label.toLowerCase().includes(query.trim().toLowerCase()))
	);
	const showCreate = $derived(
		query.trim().length > 0 &&
			!available.some((t) => t.label.toLowerCase() === query.trim().toLowerCase())
	);
	const tagColor = (t: ChatTag) => t.color ?? '#7c7c84';

	function toggle(id: string) {
		onchange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
	}
	async function create() {
		const label = query.trim();
		if (!label || creating) return;
		creating = true;
		try {
			await createOrgTag(orgId, label);
			await invalidateAll();
			const created = available.find((t) => t.label.toLowerCase() === label.toLowerCase());
			if (created && !selected.includes(created.id)) onchange([...selected, created.id]);
			query = '';
		} catch (e) {
			showToast('err', e instanceof Error ? e.message : m.chat_err_tag_failed());
		} finally {
			creating = false;
		}
	}
</script>

<div class="flex flex-wrap items-center gap-1.5">
	{#each selectedTags as t (t.id)}
		<span
			class="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[12px] text-text-2"
			style:background="{tagColor(t)}22"
		>
			<span class="h-1.5 w-1.5 rounded-full" style:background={tagColor(t)}></span>
			{t.label}
			<button
				type="button"
				aria-label={m.chat_tag_remove()}
				onclick={() => toggle(t.id)}
				class="text-text-4 hover:text-text"><Icon name="x" size={12} /></button
			>
		</span>
	{/each}

	<div class="relative">
		<button
			type="button"
			onclick={() => (open = !open)}
			class="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[12px] text-text-3 hover:border-border-strong hover:text-text"
		>
			<Icon name="plus" size={13} />
			{m.chat_tags()}
		</button>
		<Popover {open} onclose={() => (open = false)} minWidth={220} {dropUp}>
			<div class="px-1 pb-1">
				<input
					bind:value={query}
					placeholder={m.chat_tag_add()}
					class="w-full rounded-md border border-border bg-bg px-2 py-1 text-[13px] outline-none focus:border-border-strong"
				/>
			</div>
			<div class="max-h-56 overflow-y-auto">
				{#each filtered as t (t.id)}
					<button
						type="button"
						onclick={() => toggle(t.id)}
						class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2"
					>
						<span class="h-2 w-2 rounded-full" style:background={tagColor(t)}></span>
						<span class="truncate text-[14px] text-text-2">{t.label}</span>
						{#if selected.includes(t.id)}
							<span class="ml-auto text-accent"><Icon name="check" size={14} /></span>
						{/if}
					</button>
				{/each}
				{#if showCreate}
					<button
						type="button"
						onclick={create}
						disabled={creating}
						class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2 disabled:opacity-50"
					>
						<Icon name="plus" size={13} class="text-text-3" />
						<span class="truncate text-[14px] text-text-2"
							>{m.chat_tag_create({ label: query.trim() })}</span
						>
					</button>
				{/if}
				{#if filtered.length === 0 && !showCreate}
					<div class="px-2 py-1.5 text-[13px] text-text-4">{m.chat_no_tags()}</div>
				{/if}
			</div>
		</Popover>
	</div>
</div>
