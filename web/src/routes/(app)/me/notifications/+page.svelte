<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import Button from '$lib/components/Button.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import { m } from '$lib/paraglide/messages';

	type ChannelPrefs = { email: boolean; inApp: boolean };
	type NotifPrefs = Record<string, ChannelPrefs>;
	type Prefs = { notifications: NotifPrefs };

	const prefs = $derived((page.data as { preferences: Prefs }).preferences);

	const groups = $derived([
		{
			title: m.notif_group_general(),
			items: [{ key: 'mentioned', label: m.notif_mentioned(), desc: m.notif_mentioned_desc() }]
		},
		{
			title: m.notif_group_tasks(),
			items: [
				{ key: 'taskAssigned', label: m.notif_task_assigned(), desc: m.notif_task_assigned_desc() },
				{
					key: 'taskMentioned',
					label: m.notif_task_mentioned(),
					desc: m.notif_task_mentioned_desc()
				},
				{
					key: 'taskCommented',
					label: m.notif_task_commented(),
					desc: m.notif_task_commented_desc()
				},
				{
					key: 'taskStatusChanged',
					label: m.notif_task_status_changed(),
					desc: m.notif_task_status_changed_desc()
				},
				{ key: 'taskDueSoon', label: m.notif_task_due_soon(), desc: m.notif_task_due_soon_desc() }
			]
		},
		{
			title: m.notif_group_tickets(),
			items: [
				{
					key: 'ticketCreated',
					label: m.notif_ticket_created(),
					desc: m.notif_ticket_created_desc()
				},
				{
					key: 'ticketAssigned',
					label: m.notif_ticket_assigned(),
					desc: m.notif_ticket_assigned_desc()
				},
				{
					key: 'ticketStatusChanged',
					label: m.notif_ticket_status_changed(),
					desc: m.notif_ticket_status_changed_desc()
				},
				{
					key: 'ticketMessage',
					label: m.notif_ticket_message(),
					desc: m.notif_ticket_message_desc()
				}
			]
		},
		{
			title: m.notif_group_wiki(),
			items: [
				{ key: 'wikiUpdated', label: m.notif_wiki_updated(), desc: m.notif_wiki_updated_desc() }
			]
		}
	]);

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
		<h1 class="text-[26px] font-semibold tracking-[-0.014em]">{m.notif_title()}</h1>
		<p class="mt-1 text-[14px] text-text-3">{m.notif_subtitle()}</p>
	</div>
	<div class="flex items-center gap-1.5 text-[12px] text-text-3">
		<button type="button" class="hover:text-text" onclick={() => toggleAll('email', true)}
			>{m.notif_all_email_on()}</button
		>
		<span>·</span>
		<button type="button" class="hover:text-text" onclick={() => toggleAll('email', false)}
			>{m.notif_off()}</button
		>
		<span class="px-1">|</span>
		<button type="button" class="hover:text-text" onclick={() => toggleAll('inApp', true)}
			>{m.notif_all_inapp_on()}</button
		>
		<span>·</span>
		<button type="button" class="hover:text-text" onclick={() => toggleAll('inApp', false)}
			>{m.notif_off()}</button
		>
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
				showToast('ok', m.notif_toast_saved());
				await invalidateAll();
			} else if (result.type === 'failure') {
				showToast(
					'err',
					(result.data as { message?: string } | undefined)?.message ??
						m.notif_toast_could_not_save()
				);
			}
		};
	}}
	class="space-y-5"
>
	{#each groups as group (group.title)}
		<section class="overflow-hidden rounded-2xl border border-border bg-bg-elev">
			<div class="flex items-center justify-between px-5 pt-4 pb-2">
				<div class="text-[12px] tracking-[0.08em] text-text-4 uppercase">{group.title}</div>
				<div
					class="grid grid-cols-2 gap-x-8 pr-1 text-[12px] tracking-[0.08em] text-text-4 uppercase"
				>
					<span class="w-12 text-center">{m.notif_col_email()}</span>
					<span class="w-12 text-center">{m.notif_col_inapp()}</span>
				</div>
			</div>
			<div class="divide-y divide-border">
				{#each group.items as item (item.key)}
					{@const v = local[item.key] ?? { email: false, inApp: false }}
					<div class="flex items-center gap-4 px-5 py-3">
						<div class="min-w-0 flex-1">
							<div class="text-[14px] font-medium">{item.label}</div>
							<div class="mt-0.5 text-[12px] text-text-3">{item.desc}</div>
						</div>
						<div class="grid grid-cols-2 gap-x-8 pr-1">
							{#each [{ ch: 'email' as const, on: v.email }, { ch: 'inApp' as const, on: v.inApp }] as t (t.ch)}
								<label class="grid w-12 cursor-pointer place-items-center">
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
										class="relative h-5 w-9 rounded-full border transition-colors {t.on
											? 'border-accent bg-accent'
											: 'border-border bg-surface'}"
									>
										<span
											class="absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full transition-transform {t.on
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
			{saving ? m.common_saving() : m.common_save_changes()}
		</Button>
	</div>
</form>
