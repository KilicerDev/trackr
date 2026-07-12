<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import Button from '$lib/components/Button.svelte';
	import Select from '$lib/components/Select.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import { m } from '$lib/paraglide/messages';

	type ChannelPrefs = { email: boolean; inApp: boolean };
	type NotifPrefs = Record<string, ChannelPrefs>;
	type Prefs = {
		theme: string;
		density: string;
		defaultLanding: string;
		weekStartsOn: number;
		locale: string;
		notifications: NotifPrefs;
	};
	const prefs = $derived((page.data as { preferences: Prefs }).preferences);

	let theme = $state(prefs.theme);
	let density = $state(prefs.density);
	let defaultLanding = $state(prefs.defaultLanding);
	let weekStartsOn = $state(prefs.weekStartsOn);
	let locale = $state(prefs.locale);
	let saving = $state(false);

	// Notification preferences — an independent form with its own save button.
	const notifGroups = $derived([
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

	let notif = $state<NotifPrefs>(structuredClone(prefs.notifications));
	let savingNotif = $state(false);
	const notifDirty = $derived(JSON.stringify(notif) !== JSON.stringify(prefs.notifications));

	function toggleAll(channel: 'email' | 'inApp', value: boolean) {
		const nextPrefs: NotifPrefs = {};
		for (const k of Object.keys(notif)) {
			nextPrefs[k] = { ...notif[k], [channel]: value };
		}
		notif = nextPrefs;
	}

	const themes = [
		{ value: 'dark', label: m.settings_theme_dark() },
		{ value: 'light', label: m.settings_theme_light() },
		{ value: 'system', label: m.settings_theme_system() }
	];
	const densities = [
		{ value: 'comfortable', label: m.settings_density_comfortable() },
		{ value: 'compact', label: m.settings_density_compact() }
	];
	const localeOptions = [
		{ value: 'en', label: 'English' },
		{ value: 'de', label: 'Deutsch' }
	];
	const landings = [
		{ value: '/week', label: m.settings_landing_week() },
		{ value: '/tasks', label: m.settings_landing_tasks() },
		{ value: '/projects', label: m.settings_landing_projects() },
		{ value: '/tickets', label: m.settings_landing_tickets() },
		{ value: '/wiki', label: m.settings_landing_wiki() }
	];

	function applyLive() {
		document.documentElement.dataset.theme = theme === 'system' ? 'dark' : theme;
		document.documentElement.dataset.density = density;
	}

	$effect(() => {
		applyLive();
	});

	const dirty = $derived(
		theme !== prefs.theme ||
			density !== prefs.density ||
			defaultLanding !== prefs.defaultLanding ||
			weekStartsOn !== prefs.weekStartsOn ||
			locale !== prefs.locale
	);
</script>

<header class="mb-6">
	<h1 class="text-[26px] font-semibold tracking-[-0.014em]">{m.settings_title()}</h1>
	<p class="mt-1 text-[14px] text-text-3">{m.settings_subtitle()}</p>
</header>

<form
	method="post"
	action="?/update"
	use:enhance={() => {
		const localeChanged = locale !== prefs.locale;
		saving = true;
		return async ({ result }) => {
			saving = false;
			if (result.type === 'success') {
				// A language change must re-render every static message call, so
				// reload the page (the cookie is already set by the action → SSR
				// renders in the new language). Other prefs apply live.
				if (localeChanged) {
					location.reload();
					return;
				}
				showToast('ok', m.settings_toast_saved());
				await invalidateAll();
			} else if (result.type === 'failure') {
				showToast(
					'err',
					(result.data as { message?: string } | undefined)?.message ??
						m.settings_toast_could_not_save()
				);
			}
		};
	}}
	class="space-y-5"
>
	<section class="rounded-2xl border border-border bg-bg-elev p-5">
		<div class="mb-4 text-[12px] tracking-[0.08em] text-text-4 uppercase">
			{m.settings_appearance()}
		</div>
		<div class="grid grid-cols-[140px_1fr] items-center gap-x-4 gap-y-4 text-[14px]">
			<div class="text-text-3">{m.settings_theme()}</div>
			<div class="inline-flex h-8 items-center rounded-lg border border-border bg-surface p-0.5">
				{#each themes as t (t.value)}
					<button
						type="button"
						onclick={() => (theme = t.value)}
						class="h-full rounded-md px-3 text-[14px] {theme === t.value
							? 'bg-bg-elev text-text shadow-sm'
							: 'text-text-3 hover:text-text'}"
					>
						{t.label}
					</button>
				{/each}
			</div>

			<div class="text-text-3">{m.settings_density()}</div>
			<div class="inline-flex h-8 items-center rounded-lg border border-border bg-surface p-0.5">
				{#each densities as d (d.value)}
					<button
						type="button"
						onclick={() => (density = d.value)}
						class="h-full rounded-md px-3 text-[14px] {density === d.value
							? 'bg-bg-elev text-text shadow-sm'
							: 'text-text-3 hover:text-text'}"
					>
						{d.label}
					</button>
				{/each}
			</div>

			<span class="text-text-3">{m.settings_language()}</span>
			<Select bind:value={locale} options={localeOptions} ariaLabel={m.settings_language()} />
		</div>
	</section>

	<section class="rounded-2xl border border-border bg-bg-elev p-5">
		<div class="mb-4 text-[12px] tracking-[0.08em] text-text-4 uppercase">
			{m.settings_defaults()}
		</div>
		<div class="grid grid-cols-[140px_1fr] items-center gap-x-4 gap-y-4 text-[14px]">
			<span class="text-text-3">{m.settings_landing_page()}</span>
			<Select
				bind:value={defaultLanding}
				options={landings}
				ariaLabel={m.settings_landing_page()}
			/>

			<div class="text-text-3">{m.settings_week_starts_on()}</div>
			<div class="inline-flex h-8 items-center rounded-lg border border-border bg-surface p-0.5">
				{#each [{ v: 1, l: m.settings_week_monday() }, { v: 0, l: m.settings_week_sunday() }] as opt (opt.v)}
					<button
						type="button"
						onclick={() => (weekStartsOn = opt.v)}
						class="h-full rounded-md px-3 text-[14px] {weekStartsOn === opt.v
							? 'bg-bg-elev text-text shadow-sm'
							: 'text-text-3 hover:text-text'}"
					>
						{opt.l}
					</button>
				{/each}
			</div>
		</div>
	</section>

	<input type="hidden" name="theme" value={theme} />
	<input type="hidden" name="density" value={density} />
	<input type="hidden" name="defaultLanding" value={defaultLanding} />
	<input type="hidden" name="weekStartsOn" value={weekStartsOn} />
	<input type="hidden" name="locale" value={locale} />

	<div class="flex items-center justify-end gap-2">
		<Button type="submit" variant="primary" disabled={!dirty || saving}>
			{saving ? m.common_saving() : m.common_save_changes()}
		</Button>
	</div>
</form>

<form
	method="post"
	action="?/updateNotifications"
	use:enhance={() => {
		savingNotif = true;
		return async ({ result }) => {
			savingNotif = false;
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
	class="mt-8 space-y-5"
>
	<div class="flex items-end justify-between gap-4">
		<div class="text-[12px] tracking-[0.08em] text-text-4 uppercase">{m.notif_title()}</div>
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
	</div>

	{#each notifGroups as group (group.title)}
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
					{@const v = notif[item.key] ?? { email: false, inApp: false }}
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
											(notif = {
												...notif,
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
		<Button type="submit" variant="primary" disabled={!notifDirty || savingNotif}>
			{savingNotif ? m.common_saving() : m.common_save_changes()}
		</Button>
	</div>
</form>
