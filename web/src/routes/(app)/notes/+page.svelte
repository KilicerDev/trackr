<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import { m } from '$lib/paraglide/messages';

	let creating = $state(false);
</script>

<svelte:head><title>{m.notes_page_title()}</title></svelte:head>

<div class="grid min-h-full place-items-center px-8 py-16">
	<div class="max-w-[360px] text-center">
		<span class="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-surface text-text-3">
			<Icon name="file" size={22} stroke={1.6} />
		</span>
		<h1 class="mb-1.5 text-[18px] font-semibold text-text">{m.notes_landing_title()}</h1>
		<p class="mb-5 text-[13px] leading-relaxed text-text-3">{m.notes_landing_hint()}</p>
		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				creating = true;
				return async ({ result }) => {
					creating = false;
					if (result.type === 'success' && result.data?.id)
						await goto(`/notes/${result.data.id}`, { invalidateAll: true });
				};
			}}
		>
			<button
				type="submit"
				disabled={creating}
				class="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
			>
				<Icon name="plus" size={14} />
				{m.notes_new_note()}
			</button>
		</form>
	</div>
</div>
