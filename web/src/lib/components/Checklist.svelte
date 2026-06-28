<script lang="ts">
	import Icon from './Icon.svelte';
	import { m } from '$lib/paraglide/messages';

	type Item = { id: string; text: string; done: boolean };

	interface Props {
		items: Item[];
		canEdit?: boolean;
		// Called with the full next array on every mutation; the parent owns
		// persistence (last-write-wins, same as the task checklist).
		onChange: (items: Item[]) => void;
		label: string;
		addPlaceholder: string;
	}
	let { items, canEdit = false, onChange, label, addPlaceholder }: Props = $props();

	let newItem = $state('');

	const total = $derived(items.length);
	const done = $derived(items.filter((it) => it.done).length);
	const allDone = $derived(total > 0 && done === total);

	function add() {
		const text = newItem.trim();
		if (!text) return;
		onChange([...items, { id: crypto.randomUUID(), text, done: false }]);
		newItem = '';
	}
	function toggle(id: string) {
		onChange(items.map((it) => (it.id === id ? { ...it, done: !it.done } : it)));
	}
	function edit(id: string, text: string) {
		const t = text.trim();
		onChange(
			items.map((it) => (it.id === id ? { ...it, text: t } : it)).filter((it) => it.text.length > 0)
		);
	}
	function remove(id: string) {
		onChange(items.filter((it) => it.id !== id));
	}
</script>

{#if canEdit || total > 0}
	<div class="mb-6">
		<div class="mb-2.5 flex items-center gap-2.5">
			<div class="text-[12px] tracking-[0.08em] text-text-4 uppercase">{label}</div>
			{#if total > 0}
				<span class="font-mono text-[12px] {allDone ? 'text-[#7fc8a9]' : 'text-text-3'}">
					{done}/{total}
				</span>
				<div class="ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
					<div
						class="h-full rounded-full transition-all duration-300 {allDone
							? 'bg-[#7fc8a9]'
							: 'bg-accent'}"
						style:width="{(done / total) * 100}%"
					></div>
				</div>
			{/if}
		</div>
		<div
			class="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface/40"
		>
			{#each items as item (item.id)}
				<div
					class="group flex items-center gap-2.5 px-2.5 py-2 transition-colors hover:bg-surface-2/60"
				>
					<button
						type="button"
						disabled={!canEdit}
						onclick={() => toggle(item.id)}
						aria-label={item.text}
						class="grid h-[20px] w-[20px] shrink-0 place-items-center rounded-md border-[1.5px] transition-all {item.done
							? 'border-accent bg-accent text-white'
							: 'border-border-strong hover:border-accent/60'} disabled:cursor-default"
					>
						{#if item.done}<Icon name="check" size={13} />{/if}
					</button>
					{#if canEdit}
						<input
							value={item.text}
							onblur={(e) => edit(item.id, e.currentTarget.value)}
							onkeydown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									(e.currentTarget as HTMLInputElement).blur();
								}
							}}
							class="flex-1 border-0 bg-transparent text-[14px] outline-none {item.done
								? 'text-text-4 line-through'
								: 'text-text-2'}"
						/>
						<button
							type="button"
							onclick={() => remove(item.id)}
							aria-label={m.common_delete()}
							class="grid h-5 w-5 shrink-0 place-items-center rounded text-text-4 opacity-0 transition-colors group-hover:opacity-100 hover:text-accent"
						>
							<Icon name="x" size={13} />
						</button>
					{:else}
						<span
							class="flex-1 text-[14px] {item.done ? 'text-text-4 line-through' : 'text-text-2'}"
							>{item.text}</span
						>
					{/if}
				</div>
			{/each}
			{#if canEdit}
				<div class="flex items-center gap-2.5 px-2.5 py-2">
					<span class="grid h-[20px] w-[20px] shrink-0 place-items-center text-text-4">
						<Icon name="plus" size={14} />
					</span>
					<input
						bind:value={newItem}
						placeholder={addPlaceholder}
						onkeydown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								add();
							}
						}}
						class="flex-1 border-0 bg-transparent text-[14px] text-text-2 outline-none placeholder:text-text-4"
					/>
				</div>
			{/if}
		</div>
	</div>
{/if}
