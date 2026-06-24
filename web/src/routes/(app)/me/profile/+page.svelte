<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import { showToast } from '$lib/toast.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let name = $state(data.profile?.name ?? '');
	let image = $state(data.profile?.image ?? '');
	let saving = $state(false);

	const initials = $derived(
		(name || data.profile?.email || '?')
			.split(/\s+/)
			.map((p) => p[0])
			.filter(Boolean)
			.slice(0, 2)
			.join('')
			.toUpperCase()
	);
	const userColor = $derived.by(() => {
		const id = data.profile?.id ?? '';
		let h = 0;
		for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
		return `hsl(${h % 360} 55% 60%)`;
	});
	const previewUser = $derived({ name: name || '', initials, color: userColor });
	const dirty = $derived(
		(name ?? '') !== (data.profile?.name ?? '') || (image ?? '') !== (data.profile?.image ?? '')
	);
</script>

<header class="mb-6">
	<h1 class="text-[22px] font-semibold tracking-[-0.014em]">{m.profile_title()}</h1>
	<p class="mt-1 text-[12.5px] text-text-3">{m.profile_subtitle()}</p>
</header>

<form
	method="post"
	action="?/update"
	use:enhance={() => {
		saving = true;
		return async ({ result }) => {
			saving = false;
			if (result.type === 'success') {
				showToast('ok', m.profile_toast_updated());
				await invalidateAll();
			} else if (result.type === 'failure') {
				showToast(
					'err',
					(result.data as { message?: string } | undefined)?.message ??
						m.profile_toast_could_not_save()
				);
			}
		};
	}}
	class="space-y-5"
>
	<section class="rounded-2xl border border-border bg-bg-elev p-5">
		<div class="mb-4 text-[11px] tracking-[0.08em] text-text-4 uppercase">
			{m.profile_identity()}
		</div>
		<div class="flex items-start gap-5">
			<div class="flex flex-col items-center gap-2 pt-1">
				<Avatar user={previewUser} size={64} />
				<span class="text-[11px] text-text-4">{m.profile_preview()}</span>
			</div>
			<div class="grid flex-1 grid-cols-[120px_1fr] items-center gap-x-4 gap-y-3 text-[13px]">
				<label for="pf-name" class="text-text-3">{m.profile_name()}</label>
				<input
					id="pf-name"
					name="name"
					bind:value={name}
					maxlength="80"
					class="rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-border-strong"
				/>
				<label for="pf-image" class="text-text-3">{m.profile_avatar_url()}</label>
				<input
					id="pf-image"
					name="image"
					placeholder="https://…"
					bind:value={image}
					class="rounded-lg border border-border bg-surface px-3 py-2 font-mono text-[12px] outline-none focus:border-border-strong"
				/>
				<div class="text-text-3">{m.profile_email()}</div>
				<div class="font-mono text-[12.5px] text-text-2">{data.profile?.email ?? '—'}</div>
				<div class="text-text-3">{m.profile_member_since()}</div>
				<div class="text-text-2">
					{data.profile?.createdAt
						? new Date(data.profile.createdAt).toLocaleDateString(undefined, {
								year: 'numeric',
								month: 'long',
								day: 'numeric'
							})
						: '—'}
				</div>
			</div>
		</div>
	</section>

	<div class="flex items-center justify-end gap-2">
		<Button type="submit" variant="primary" disabled={!dirty || saving}>
			{saving ? m.common_saving() : m.common_save_changes()}
		</Button>
	</div>
</form>
