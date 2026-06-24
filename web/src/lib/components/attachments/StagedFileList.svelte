<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import Icon from '../Icon.svelte';
	import { formatBytes } from '$lib/attachments/config';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		files: File[];
		onremove: (index: number) => void;
		disabled?: boolean;
	}

	let { files, onremove, disabled = false }: Props = $props();

	// Object URLs for image previews, created lazily and revoked when their file
	// leaves the staged set or the component unmounts — otherwise they leak.
	const previews = new SvelteMap<File, string>();

	// Reconcile previews with the current files: add new image files, drop gone ones.
	$effect(() => {
		const wanted = files.filter(
			(f) => f.type.startsWith('image/') && f.type !== 'image/svg+xml'
		);
		for (const file of wanted) {
			if (!previews.has(file)) previews.set(file, URL.createObjectURL(file));
		}
		for (const [file, url] of [...previews]) {
			if (!wanted.includes(file)) {
				URL.revokeObjectURL(url);
				previews.delete(file);
			}
		}
	});

	// Revoke any remaining URLs on unmount (this effect reads nothing reactive, so
	// its teardown runs only on destroy).
	$effect(() => () => {
		for (const url of previews.values()) URL.revokeObjectURL(url);
	});
</script>

{#if files.length}
	<ul class="flex flex-col gap-1.5">
		{#each files as file, i (file.name + file.size + i)}
			<li
				class="flex items-center gap-2.5 px-2 py-1.5 rounded-lg bg-surface border border-border"
			>
				{#if previews.get(file)}
					<img
						src={previews.get(file)}
						alt=""
						class="w-8 h-8 rounded-md object-cover shrink-0 border border-border"
					/>
				{:else}
					<span class="w-8 h-8 grid place-items-center rounded-md bg-surface-2 text-text-3 shrink-0">
						<Icon name="file" size={15} />
					</span>
				{/if}
				<div class="min-w-0 flex-1">
					<div class="text-[12.5px] text-text truncate">{file.name}</div>
					<div class="text-[11px] text-text-3">{formatBytes(file.size)}</div>
				</div>
				<button
					type="button"
					{disabled}
					onclick={() => onremove(i)}
					aria-label={m.attach_remove_file({ filename: file.name })}
					class="w-7 h-7 grid place-items-center rounded-md text-text-3 hover:text-text hover:bg-surface-2 transition-colors disabled:opacity-50"
				>
					<Icon name="x" size={13} />
				</button>
			</li>
		{/each}
	</ul>
{/if}
