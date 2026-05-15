<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { alert as uiAlert } from '$lib/components/confirm.svelte';

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
					title: 'Could not stop impersonation',
					message: data.message ?? 'Please try again in a moment.',
					tone: 'danger'
				});
				stopping = false;
				return;
			}
			await invalidateAll();
			await goto('/admin/users', { invalidateAll: true });
		} catch {
			await uiAlert({
				title: 'Could not stop impersonation',
				message: 'Please try again in a moment.',
				tone: 'danger'
			});
			stopping = false;
		}
	}
</script>

<div
	class="flex items-center gap-3 px-5 h-9 text-[12.5px] border-b"
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
		<path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
	</svg>
	<span class="text-text">
		Impersonating <span class="font-semibold">{targetName ?? targetEmail}</span>
		<span class="text-text-3"> · </span>
		<span class="text-text-3">signed in as {impersonatorName ?? impersonatorEmail}</span>
	</span>
	<button
		type="button"
		onclick={stop}
		disabled={stopping}
		class="ml-auto inline-flex items-center h-6 px-2.5 rounded-md text-[12px] font-semibold transition-colors disabled:opacity-60"
		style:background="rgba(240,168,92,0.22)"
		style:color="#f0a85c"
	>
		{stopping ? 'Stopping…' : 'Stop impersonating'}
	</button>
</div>
