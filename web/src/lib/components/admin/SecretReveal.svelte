<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { showToast } from '$lib/stores/toast.svelte';
	import Icon from '../Icon.svelte';

	interface Props {
		secret: string;
		// Defaults are the webhook signing-secret copy; API keys pass their own.
		title?: string;
		description?: string;
	}
	let {
		secret,
		title = m.webhooks_secret_shown_once(),
		description = m.webhooks_secret_shown_once_desc()
	}: Props = $props();
	let copied = $state(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(secret);
			copied = true;
			showToast('ok', m.common_copied());
			setTimeout(() => (copied = false), 2000);
		} catch {
			showToast('err', m.webhooks_secret_copy_failed());
		}
	}
</script>

<div class="rounded-lg border border-[#e9c46a]/40 bg-[#e9c46a]/8 p-3">
	<div class="mb-1 flex items-center gap-2 text-[13px] font-medium text-text">
		<Icon name="shield" size={14} class="text-[#e9c46a]" />
		{title}
	</div>
	<p class="mb-2 text-[12px] text-text-3">{description}</p>
	<div class="flex items-center gap-2">
		<code
			class="min-w-0 flex-1 truncate rounded-md border border-border bg-bg px-2.5 py-1.5 font-mono text-[12.5px] text-text select-all"
			>{secret}</code
		>
		<button
			type="button"
			onclick={copy}
			class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[13px] text-text-2 transition-colors hover:text-text"
		>
			<Icon name={copied ? 'check' : 'link'} size={13} />
			{copied ? m.common_copied() : m.common_copy()}
		</button>
	</div>
</div>
