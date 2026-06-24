<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import Button from '$lib/components/Button.svelte';
	import Select from '$lib/components/Select.svelte';
	import { showToast } from '$lib/toast.svelte';
	import { m } from '$lib/paraglide/messages';

	type Prefs = {
		theme: string;
		accent: string;
		density: string;
		defaultLanding: string;
		weekStartsOn: number;
		locale: string;
	};
	const prefs = $derived((page.data as { preferences: Prefs }).preferences);

	let theme = $state(prefs.theme);
	let accent = $state(prefs.accent);
	let density = $state(prefs.density);
	let defaultLanding = $state(prefs.defaultLanding);
	let weekStartsOn = $state(prefs.weekStartsOn);
	let locale = $state(prefs.locale);
	let saving = $state(false);

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
	const accents = ['#ef7a6d', '#7a9cf0', '#7fc8a9', '#c08bd6', '#f0a85c', '#9aa4b2'];
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
		document.documentElement.style.setProperty('--accent', accent);
	}

	$effect(() => {
		applyLive();
	});

	const dirty = $derived(
		theme !== prefs.theme ||
			accent !== prefs.accent ||
			density !== prefs.density ||
			defaultLanding !== prefs.defaultLanding ||
			weekStartsOn !== prefs.weekStartsOn ||
			locale !== prefs.locale
	);
</script>

<header class="mb-6">
	<h1 class="text-[22px] font-semibold tracking-[-0.014em]">{m.settings_title()}</h1>
	<p class="mt-1 text-[12.5px] text-text-3">{m.settings_subtitle()}</p>
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
		<div class="mb-4 text-[11px] tracking-[0.08em] text-text-4 uppercase">
			{m.settings_appearance()}
		</div>
		<div class="grid grid-cols-[140px_1fr] items-center gap-x-4 gap-y-4 text-[13px]">
			<div class="text-text-3">{m.settings_theme()}</div>
			<div class="inline-flex h-8 items-center rounded-lg border border-border bg-surface p-0.5">
				{#each themes as t (t.value)}
					<button
						type="button"
						onclick={() => (theme = t.value)}
						class="h-full rounded-md px-3 text-[12.5px] {theme === t.value
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
						class="h-full rounded-md px-3 text-[12.5px] {density === d.value
							? 'bg-bg-elev text-text shadow-sm'
							: 'text-text-3 hover:text-text'}"
					>
						{d.label}
					</button>
				{/each}
			</div>

			<div class="text-text-3">{m.settings_accent()}</div>
			<div class="flex items-center gap-2">
				{#each accents as c (c)}
					<button
						type="button"
						onclick={() => (accent = c)}
						aria-label={m.settings_accent_color()}
						class="grid h-7 w-7 place-items-center rounded-md transition-transform hover:scale-110 {accent ===
						c
							? 'ring-2 ring-text/20'
							: ''}"
						style:background={c}
					>
						{#if accent === c}<Icon name="check" size={13} class="text-white" />{/if}
					</button>
				{/each}
			</div>

			<span class="text-text-3">{m.settings_language()}</span>
			<Select bind:value={locale} options={localeOptions} ariaLabel={m.settings_language()} />
		</div>
	</section>

	<section class="rounded-2xl border border-border bg-bg-elev p-5">
		<div class="mb-4 text-[11px] tracking-[0.08em] text-text-4 uppercase">
			{m.settings_defaults()}
		</div>
		<div class="grid grid-cols-[140px_1fr] items-center gap-x-4 gap-y-4 text-[13px]">
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
						class="h-full rounded-md px-3 text-[12.5px] {weekStartsOn === opt.v
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
	<input type="hidden" name="accent" value={accent} />
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
