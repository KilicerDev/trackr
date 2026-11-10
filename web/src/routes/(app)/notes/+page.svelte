<script lang="ts">
	import { pageTitle } from '$lib/brand';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import Button from '$lib/components/Button.svelte';
	import { getContext } from 'svelte';
	import { m } from '$lib/paraglide/messages';

	let creating = $state(false);
	const newMeeting = getContext<(() => void) | undefined>('notes:newMeeting');
</script>

<svelte:head><title>{pageTitle(m.notes_page_title())}</title></svelte:head>

<div class="grid min-h-full place-items-center px-8 py-16">
	<div class="max-w-[396px] text-center">
		<span class="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-surface text-text-3">
			<Icon name="file" size={24} stroke={1.6} />
		</span>
		<h1 class="mb-1.5 text-[20px] font-semibold text-text">{m.notes_landing_title()}</h1>
		<p class="mb-5 text-[14px] leading-relaxed text-text-3">{m.notes_landing_hint()}</p>
		<!-- Notes and meeting notes share this space: both get a way in. -->
		<form
			class="flex items-center justify-center gap-2"
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
			<Button type="submit" variant="primary" disabled={creating}>
				<Icon name="file" size={15} />
				{m.notes_new_note()}
			</Button>
			{#if newMeeting}
				<Button onclick={newMeeting}>
					<Icon name="users" size={15} />
					{m.notes_new_meeting()}
				</Button>
			{/if}
		</form>
	</div>
</div>
