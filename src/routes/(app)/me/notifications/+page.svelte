<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import Button from '$lib/components/Button.svelte';
	import { showToast } from '$lib/toast.svelte';

	type ChannelPrefs = { email: boolean; inApp: boolean };
	type NotifPrefs = Record<string, ChannelPrefs>;
	type Prefs = { notifications: NotifPrefs };

	const prefs = $derived((page.data as { preferences: Prefs }).preferences);

	const groups = [
		{
			title: 'Tasks',
			items: [
				{ key: 'taskAssigned', label: 'Assigned to me', desc: 'When a task is assigned to you.' },
				{ key: 'taskMentioned', label: 'Mentions', desc: 'When someone @mentions you in a task.' },
				{ key: 'taskCommented', label: 'New comments', desc: 'On tasks you watch or are assigned to.' },
				{ key: 'taskStatusChanged', label: 'Status changes', desc: 'When the status of one of your tasks changes.' },
				{ key: 'taskDueSoon', label: 'Due soon', desc: 'A task you own is due in the next 24 hours.' }
			]
		},
		{
			title: 'Tickets',
			items: [
				{ key: 'ticketAssigned', label: 'Assigned to me', desc: 'When a ticket is routed to you.' },
				{ key: 'ticketMessage', label: 'New messages', desc: 'On tickets you handle.' }
			]
		},
		{
			title: 'Wiki',
			items: [
				{ key: 'wikiUpdated', label: 'Page updates', desc: 'When a page you watch is edited.' }
			]
		}
	];

	let local = $state<NotifPrefs>(structuredClone(prefs.notifications));
	let saving = $state(false);

	const dirty = $derived(JSON.stringify(local) !== JSON.stringify(prefs.notifications));

	function toggleAll(channel: 'email' | 'inApp', value: boolean) {
		const next: NotifPrefs = {};
		for (const k of Object.keys(local)) {
			next[k] = { ...local[k], [channel]: value };
		}
		local = next;
	}
</script>

<header class="mb-6 flex items-end justify-between gap-4">
	<div>
		<h1 class="text-[22px] font-semibold tracking-[-0.014em]">Notifications</h1>
		<p class="text-[12.5px] text-text-3 mt-1">Choose how you want to be notified for each kind of event.</p>
	</div>
	<div class="flex items-center gap-1.5 text-[11.5px] text-text-3">
		<button type="button" class="hover:text-text" onclick={() => toggleAll('email', true)}>All email on</button>
		<span>·</span>
		<button type="button" class="hover:text-text" onclick={() => toggleAll('email', false)}>off</button>
		<span class="px-1">|</span>
		<button type="button" class="hover:text-text" onclick={() => toggleAll('inApp', true)}>All in-app on</button>
		<span>·</span>
		<button type="button" class="hover:text-text" onclick={() => toggleAll('inApp', false)}>off</button>
	</div>
</header>

<form
	method="post"
	action="?/update"
	use:enhance={() => {
		saving = true;
		return async ({ result }) => {
			saving = false;
			if (result.type === 'success') {
				showToast('ok', 'Notification preferences saved');
				await invalidateAll();
			} else if (result.type === 'failure') {
				showToast('err', (result.data as { message?: string } | undefined)?.message ?? 'Could not save');
			}
		};
	}}
	class="space-y-5"
>
	{#each groups as group (group.title)}
		<section class="bg-bg-elev border border-border rounded-2xl overflow-hidden">
			<div class="flex items-center justify-between px-5 pt-4 pb-2">
				<div class="text-[11px] uppercase tracking-[0.08em] text-text-4">{group.title}</div>
				<div class="grid grid-cols-2 gap-x-8 text-[10.5px] uppercase tracking-[0.08em] text-text-4 pr-1">
					<span class="text-center w-12">Email</span>
					<span class="text-center w-12">In-app</span>
				</div>
			</div>
			<div class="divide-y divide-border">
				{#each group.items as item (item.key)}
					{@const v = local[item.key] ?? { email: false, inApp: false }}
					<div class="flex items-center gap-4 px-5 py-3">
						<div class="flex-1 min-w-0">
							<div class="text-[13px] font-medium">{item.label}</div>
							<div class="text-[11.5px] text-text-3 mt-0.5">{item.desc}</div>
						</div>
						<div class="grid grid-cols-2 gap-x-8 pr-1">
							{#each [{ ch: 'email' as const, on: v.email }, { ch: 'inApp' as const, on: v.inApp }] as t (t.ch)}
								<label class="w-12 grid place-items-center cursor-pointer">
									<input
										type="checkbox"
										name="{item.key}.{t.ch}"
										checked={t.on}
										onchange={(e) =>
											(local = {
												...local,
												[item.key]: { ...v, [t.ch]: (e.target as HTMLInputElement).checked }
											})}
										class="sr-only"
									/>
									<span
										class="w-9 h-5 rounded-full border relative transition-colors {t.on
											? 'bg-accent border-accent'
											: 'bg-surface border-border'}"
									>
										<span
											class="absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full transition-transform {t.on
												? 'translate-x-4 bg-white'
												: 'translate-x-0 bg-text-2'}"
										></span>
									</span>
								</label>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</section>
	{/each}

	<div class="flex items-center justify-end gap-2">
		<Button type="submit" variant="primary" disabled={!dirty || saving}>
			{saving ? 'Saving…' : 'Save changes'}
		</Button>
	</div>
</form>
