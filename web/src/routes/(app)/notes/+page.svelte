<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import { m } from '$lib/paraglide/messages';

	let creating = $state(false);
</script>

<svelte:head><title>{m.notes_page_title()}</title></svelte:head>

<div class="grid place-items-center min-h-full px-8 py-16">
	<div class="text-center max-w-[360px]">
		<span class="grid place-items-center w-12 h-12 mx-auto mb-4 rounded-2xl bg-surface text-text-3">
			<Icon name="file" size={22} stroke={1.6} />
		</span>
		<h1 class="text-[17px] font-semibold text-text mb-1.5">{m.notes_landing_title()}</h1>
		<p class="text-[13px] text-text-3 leading-relaxed mb-5">{m.notes_landing_hint()}</p>
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
				class="inline-flex items-center gap-1.5 bg-accent text-white rounded-lg px-3.5 py-2 text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
			>
				<Icon name="plus" size={14} />
				{m.notes_new_note()}
			</button>
		</form>
	</div>
</div>
