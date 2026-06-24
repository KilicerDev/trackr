<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { alert as uiAlert } from '$lib/components/confirm.svelte';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		targetName: string | null;
		targetEmail: string;
		impersonatorName: string | null;
		impersonatorEmail: string;
	};

	let { targetName, targetEmail, impersonatorName, impersonatorEmail }: Props = $props();
	let stopping = $state(false);

	async function stop() {
		if (stopping) return;
		stopping = true;
		try {
			const res = await fetch('/admin/stop-impersonating', { method: 'POST' });
			if (!res.ok) {
				const data = (await res.json().catch(() => ({}))) as { message?: string };
				await uiAlert({
					title: m.shell_impersonation_stop_error_title(),
					message: data.message ?? m.shell_impersonation_try_again(),
					tone: 'danger'
				});
				stopping = false;
				return;
			}
			await invalidateAll();
			await goto('/admin/users', { invalidateAll: true });
		} catch {
			await uiAlert({
				title: m.shell_impersonation_stop_error_title(),
				message: m.shell_impersonation_try_again(),
				tone: 'danger'
			});
			stopping = false;
		}
	}
</script>

<div
	class="flex h-9 items-center gap-3 border-b px-5 text-[12.5px]"
	style:background="rgba(240,168,92,0.14)"
	style:border-color="rgba(240,168,92,0.35)"
	style:color="#f0a85c"
>
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="14"
		height="14"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<path d="M12 9v4M12 17h.01" />
		<path
			d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
		/>
	</svg>
	<span class="text-text">
		{m.shell_impersonation_label()} <span class="font-semibold">{targetName ?? targetEmail}</span>
		<span class="text-text-3"> · </span>
		<span class="text-text-3"
			>{m.shell_impersonation_signed_in_as({ name: impersonatorName ?? impersonatorEmail })}</span
		>
	</span>
	<button
		type="button"
		onclick={stop}
		disabled={stopping}
		class="ml-auto inline-flex h-6 items-center rounded-md px-2.5 text-[12px] font-semibold transition-colors disabled:opacity-60"
		style:background="rgba(240,168,92,0.22)"
		style:color="#f0a85c"
	>
		{stopping ? m.shell_impersonation_stopping() : m.shell_impersonation_stop()}
	</button>
</div>
