<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import Button from '$lib/components/Button.svelte';
	import Select from '$lib/components/Select.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import { m } from '$lib/paraglide/messages';

	type DeliveryMode = 'off' | 'instant' | 'digest';
	type ChannelPrefs = { email: DeliveryMode; inApp: boolean };
	type NotifPrefs = Record<string, ChannelPrefs>;
	type QuietHours = { enabled: boolean; start: string; end: string; weekends: boolean };
	type DigestConfig = { frequency: 'hourly' | 'daily'; hour: number };
	type ScopeMode = 'all' | 'participating' | 'mentions';
	type NotificationScope = { tickets: ScopeMode; chat: ScopeMode };
	type Prefs = {
		theme: string;
		density: string;
		defaultLanding: string;
		weekStartsOn: number;
		locale: string;
		notifications: NotifPrefs;
		quietHours: QuietHours;
		digest: DigestConfig;
		notificationScope: NotificationScope;
	};
	const prefs = $derived((page.data as { preferences: Prefs }).preferences);

	// Scope controls are only meaningful for see-all users (they receive org-wide
	// ticket/chat events). org.member only ever gets its own items, so hide them.
	const seeAll = $derived.by(() => {
		const data = page.data as {
			isTrackrTeam?: boolean;
			memberRoles?: { orgs?: Record<string, string> };
		};
		if (data.isTrackrTeam) return true;
		return Object.values(data.memberRoles?.orgs ?? {}).some((r) => r !== 'org.member');
	});

	// Which notification surfaces this user can actually reach. A portal client
	// can never receive a wiki or task event, so offering the toggles is noise.
	// Mirrors the route guards: wiki is internal-team only; tasks/projects need
	// project access (team or explicit project membership); chat needs
	// org.chat.read somewhere. UI gating only — the server keeps hidden groups'
	// stored values untouched on save.
	const access = $derived.by(() => {
		const data = page.data as {
			isTrackrTeam?: boolean;
			effectivePermissions?: string[];
			memberRoles?: { orgs?: Record<string, string>; projects?: Record<string, string> };
		};
		const team = !!data.isTrackrTeam;
		const perms = data.effectivePermissions ?? [];
		const projectAccess = team || Object.keys(data.memberRoles?.projects ?? {}).length > 0;
		return {
			tasks: projectAccess,
			projects: projectAccess,
			tickets: team || perms.some((p) => p.startsWith('org.tickets.')),
			chat: team || perms.includes('org.chat.read'),
			wiki: team
		};
	});
	const scopeOptions = $derived([
		{ value: 'all', label: m.notif_scope_all() },
		{ value: 'participating', label: m.notif_scope_participating() },
		{ value: 'mentions', label: m.notif_scope_mentions() }
	]);

	const emailModes: { value: DeliveryMode; label: string }[] = $derived([
		{ value: 'off', label: m.notif_mode_off() },
		{ value: 'instant', label: m.notif_mode_instant() },
		{ value: 'digest', label: m.notif_mode_digest() }
	]);

	let theme = $state(prefs.theme);
	let density = $state(prefs.density);
	let defaultLanding = $state(prefs.defaultLanding);
	let weekStartsOn = $state(prefs.weekStartsOn);
	let locale = $state(prefs.locale);
	let saving = $state(false);

	// Notification preferences — an independent form with its own save button.
	// Mentions live inside each surface's group so they can be tuned separately
	// (a client can keep ticket mentions on while muting everything else).
	const notifGroups = $derived(
		[
			{
				title: m.notif_group_tasks(),
				show: access.tasks,
				items: [
					{
						key: 'taskAssigned',
						label: m.notif_task_assigned(),
						desc: m.notif_task_assigned_desc()
					},
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
				show: access.tickets,
				scopeKey: 'tickets' as const,
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
					},
					{
						key: 'ticketMentioned',
						label: m.notif_ticket_mentioned(),
						desc: m.notif_ticket_mentioned_desc()
					}
				]
			},
			{
				title: m.notif_group_chat(),
				show: access.chat,
				scopeKey: 'chat' as const,
				items: [
					{ key: 'chatMessage', label: m.notif_chat_message(), desc: m.notif_chat_message_desc() },
					{
						key: 'chatMentioned',
						label: m.notif_chat_mentioned(),
						desc: m.notif_chat_mentioned_desc()
					}
				]
			},
			{
				title: m.notif_group_projects(),
				show: access.projects,
				items: [
					{
						key: 'projectMentioned',
						label: m.notif_project_mentioned(),
						desc: m.notif_project_mentioned_desc()
					}
				]
			},
			{
				title: m.notif_group_wiki(),
				show: access.wiki,
				items: [
					{ key: 'wikiUpdated', label: m.notif_wiki_updated(), desc: m.notif_wiki_updated_desc() }
				]
			}
		].filter((g) => g.show)
	);

	let notif = $state<NotifPrefs>(structuredClone(prefs.notifications));
	let quietHours = $state<QuietHours>(structuredClone(prefs.quietHours));
	let digest = $state<DigestConfig>(structuredClone(prefs.digest));
	let scope = $state<NotificationScope>(structuredClone(prefs.notificationScope));
	let savingNotif = $state(false);
	const notifDirty = $derived(
		JSON.stringify(notif) !== JSON.stringify(prefs.notifications) ||
			JSON.stringify(quietHours) !== JSON.stringify(prefs.quietHours) ||
			JSON.stringify(digest) !== JSON.stringify(prefs.digest) ||
			JSON.stringify(scope) !== JSON.stringify(prefs.notificationScope)
	);

	// Only touch keys the user can see — hidden surfaces keep their stored values.
	const visibleKeys = $derived(notifGroups.flatMap((g) => g.items.map((i) => i.key)));
	function setAllEmail(mode: DeliveryMode) {
		const next: NotifPrefs = { ...notif };
		for (const k of visibleKeys) next[k] = { ...notif[k], email: mode };
		notif = next;
	}
	function setAllInApp(value: boolean) {
		const next: NotifPrefs = { ...notif };
		for (const k of visibleKeys) next[k] = { ...notif[k], inApp: value };
		notif = next;
	}

	const digestFrequencies = $derived([
		{ value: 'hourly', label: m.notif_digest_hourly() },
		{ value: 'daily', label: m.notif_digest_daily() }
	]);
	const hourOptions = Array.from({ length: 24 }, (_, h) => ({
		value: String(h),
		label: `${String(h).padStart(2, '0')}:00`
	}));

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
			<button type="button" class="hover:text-text" onclick={() => setAllEmail('instant')}
				>{m.notif_all_email_on()}</button
			>
			<span>·</span>
			<button type="button" class="hover:text-text" onclick={() => setAllEmail('off')}
				>{m.notif_off()}</button
			>
			<span class="px-1">|</span>
			<button type="button" class="hover:text-text" onclick={() => setAllInApp(true)}
				>{m.notif_all_inapp_on()}</button
			>
			<span>·</span>
			<button type="button" class="hover:text-text" onclick={() => setAllInApp(false)}
				>{m.notif_off()}</button
			>
		</div>
	</div>

	<!-- Delivery: how batched (digest) email is sent, and when to hold instant mail. -->
	<section class="rounded-2xl border border-border bg-bg-elev p-5">
		<div class="mb-4 text-[12px] tracking-[0.08em] text-text-4 uppercase">
			{m.notif_delivery_title()}
		</div>
		<div class="grid grid-cols-[160px_1fr] items-center gap-x-4 gap-y-4 text-[14px]">
			<span class="text-text-3">{m.notif_digest_label()}</span>
			<div class="flex flex-wrap items-center gap-2">
				<div class="inline-flex h-8 items-center rounded-lg border border-border bg-surface p-0.5">
					{#each digestFrequencies as f (f.value)}
						<button
							type="button"
							onclick={() => (digest = { ...digest, frequency: f.value as 'hourly' | 'daily' })}
							class="h-full rounded-md px-3 text-[13px] {digest.frequency === f.value
								? 'bg-bg-elev text-text shadow-sm'
								: 'text-text-3 hover:text-text'}"
						>
							{f.label}
						</button>
					{/each}
				</div>
				{#if digest.frequency === 'daily'}
					<span class="text-[13px] text-text-3">{m.notif_digest_at()}</span>
					<Select
						value={String(digest.hour)}
						options={hourOptions}
						ariaLabel={m.notif_digest_at()}
						onchange={(val: string) => (digest = { ...digest, hour: Number(val) })}
					/>
				{/if}
			</div>

			<span class="text-text-3">{m.notif_quiet_label()}</span>
			<div class="flex flex-wrap items-center gap-3">
				<label class="flex cursor-pointer items-center gap-2">
					<input type="checkbox" bind:checked={quietHours.enabled} class="accent-accent" />
					<span class="text-[13px] text-text-3">{m.notif_quiet_enable()}</span>
				</label>
				{#if quietHours.enabled}
					<span class="text-[13px] text-text-3">{m.notif_quiet_from()}</span>
					<input
						type="time"
						bind:value={quietHours.start}
						class="h-8 rounded-lg border border-border bg-surface px-2 text-[13px]"
					/>
					<span class="text-[13px] text-text-3">{m.notif_quiet_to()}</span>
					<input
						type="time"
						bind:value={quietHours.end}
						class="h-8 rounded-lg border border-border bg-surface px-2 text-[13px]"
					/>
					<label class="flex cursor-pointer items-center gap-2">
						<input type="checkbox" bind:checked={quietHours.weekends} class="accent-accent" />
						<span class="text-[13px] text-text-3">{m.notif_quiet_weekends()}</span>
					</label>
				{/if}
			</div>
		</div>
		<p class="mt-3 text-[12px] text-text-3">{m.notif_delivery_hint()}</p>
	</section>

	<input type="hidden" name="digest.frequency" value={digest.frequency} />
	<input type="hidden" name="digest.hour" value={digest.hour} />
	<input type="hidden" name="quietHours.enabled" value={quietHours.enabled ? 'on' : ''} />
	<input type="hidden" name="quietHours.start" value={quietHours.start} />
	<input type="hidden" name="quietHours.end" value={quietHours.end} />
	<input type="hidden" name="quietHours.weekends" value={quietHours.weekends ? 'on' : ''} />
	{#if seeAll}
		<input type="hidden" name="scope.tickets" value={scope.tickets} />
		<input type="hidden" name="scope.chat" value={scope.chat} />
	{/if}

	{#each notifGroups as group (group.title)}
		{@const scopeKey = (group as { scopeKey?: 'tickets' | 'chat' }).scopeKey}
		<section class="overflow-hidden rounded-2xl border border-border bg-bg-elev">
			<div class="flex items-center justify-between px-5 pt-4 pb-2">
				<div class="text-[12px] tracking-[0.08em] text-text-4 uppercase">{group.title}</div>
				<div
					class="flex items-center gap-6 pr-1 text-[12px] tracking-[0.08em] text-text-4 uppercase"
				>
					<span class="w-[168px] text-center">{m.notif_col_email()}</span>
					<span class="w-12 text-center">{m.notif_col_inapp()}</span>
				</div>
			</div>
			{#if scopeKey && seeAll}
				<div class="flex flex-wrap items-center gap-2 px-5 pb-3">
					<span class="text-[12px] text-text-3">{m.notif_scope_label()}</span>
					<Select
						value={scope[scopeKey]}
						options={scopeOptions}
						ariaLabel={m.notif_scope_label()}
						maxWidth={220}
						onchange={(val: string) => (scope = { ...scope, [scopeKey]: val as ScopeMode })}
					/>
				</div>
			{/if}
			<div class="divide-y divide-border">
				{#each group.items as item (item.key)}
					{@const v = notif[item.key] ?? { email: 'off', inApp: false }}
					<div class="flex items-center gap-4 px-5 py-3">
						<div class="min-w-0 flex-1">
							<div class="text-[14px] font-medium">{item.label}</div>
							<div class="mt-0.5 text-[12px] text-text-3">{item.desc}</div>
						</div>
						<div class="flex items-center gap-6 pr-1">
							<!-- Email delivery mode -->
							<div
								class="inline-flex h-8 w-[168px] items-center rounded-lg border border-border bg-surface p-0.5"
							>
								{#each emailModes as mode (mode.value)}
									<button
										type="button"
										onclick={() => (notif = { ...notif, [item.key]: { ...v, email: mode.value } })}
										class="h-full flex-1 rounded-md text-[12px] {v.email === mode.value
											? 'bg-bg-elev text-text shadow-sm'
											: 'text-text-3 hover:text-text'}"
									>
										{mode.label}
									</button>
								{/each}
							</div>
							<input type="hidden" name="{item.key}.email" value={v.email} />
							<!-- In-app toggle -->
							<label class="grid w-12 cursor-pointer place-items-center">
								<input
									type="checkbox"
									name="{item.key}.inApp"
									checked={v.inApp}
									onchange={(e) =>
										(notif = {
											...notif,
											[item.key]: { ...v, inApp: (e.target as HTMLInputElement).checked }
										})}
									class="sr-only"
								/>
								<span
									class="relative h-5 w-9 rounded-full border transition-colors {v.inApp
										? 'border-accent bg-accent'
										: 'border-border bg-surface'}"
								>
									<span
										class="absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full transition-transform {v.inApp
											? 'translate-x-4 bg-white'
											: 'translate-x-0 bg-text-2'}"
									></span>
								</span>
							</label>
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
