<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import Button from '$lib/components/Button.svelte';
	import { showToast } from '$lib/toast.svelte';

	type Prefs = {
		theme: string;
		accent: string;
		density: string;
		defaultLanding: string;
		weekStartsOn: number;
	};
	const prefs = $derived((page.data as { preferences: Prefs }).preferences);

	let theme = $state(prefs.theme);
	let accent = $state(prefs.accent);
	let density = $state(prefs.density);
	let defaultLanding = $state(prefs.defaultLanding);
	let weekStartsOn = $state(prefs.weekStartsOn);
	let saving = $state(false);

	const themes = ['dark', 'light', 'system'] as const;
	const densities = ['comfortable', 'compact'] as const;
	const accents = ['#ef7a6d', '#7a9cf0', '#7fc8a9', '#c08bd6', '#f0a85c', '#9aa4b2'];
	const landings = [
		{ value: '/week', label: 'My week' },
		{ value: '/tasks', label: 'Tasks' },
		{ value: '/projects', label: 'Projects' },
		{ value: '/tickets', label: 'Tickets' },
		{ value: '/wiki', label: 'Wiki' }
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
			weekStartsOn !== prefs.weekStartsOn
	);
</script>

<header class="mb-6">
	<h1 class="text-[22px] font-semibold tracking-[-0.014em]">Account settings</h1>
	<p class="text-[12.5px] text-text-3 mt-1">Personal appearance and default behavior across the app.</p>
</header>

<form
	method="post"
	action="?/update"
	use:enhance={() => {
		saving = true;
		return async ({ result }) => {
			saving = false;
			if (result.type === 'success') {
				showToast('ok', 'Settings saved');
				await invalidateAll();
			} else if (result.type === 'failure') {
				showToast('err', (result.data as { message?: string } | undefined)?.message ?? 'Could not save');
			}
		};
	}}
	class="space-y-5"
>
	<section class="bg-bg-elev border border-border rounded-2xl p-5">
		<div class="text-[11px] uppercase tracking-[0.08em] text-text-4 mb-4">Appearance</div>
		<div class="grid grid-cols-[140px_1fr] items-center gap-y-4 gap-x-4 text-[13px]">
			<div class="text-text-3">Theme</div>
			<div class="inline-flex items-center h-8 bg-surface border border-border rounded-lg p-0.5">
				{#each themes as t (t)}
					<button
						type="button"
						onclick={() => (theme = t)}
						class="px-3 h-full rounded-md text-[12.5px] capitalize {theme === t
							? 'bg-bg-elev text-text shadow-sm'
							: 'text-text-3 hover:text-text'}"
					>
						{t}
					</button>
				{/each}
			</div>

			<div class="text-text-3">Density</div>
			<div class="inline-flex items-center h-8 bg-surface border border-border rounded-lg p-0.5">
				{#each densities as d (d)}
					<button
						type="button"
						onclick={() => (density = d)}
						class="px-3 h-full rounded-md text-[12.5px] capitalize {density === d
							? 'bg-bg-elev text-text shadow-sm'
							: 'text-text-3 hover:text-text'}"
					>
						{d}
					</button>
				{/each}
			</div>

			<div class="text-text-3">Accent</div>
			<div class="flex items-center gap-2">
				{#each accents as c (c)}
					<button
						type="button"
						onclick={() => (accent = c)}
						aria-label="Accent color"
						class="w-7 h-7 rounded-md grid place-items-center transition-transform hover:scale-110 {accent === c
							? 'ring-2 ring-text/20'
							: ''}"
						style:background={c}
					>
						{#if accent === c}<Icon name="check" size={13} class="text-white" />{/if}
					</button>
				{/each}
			</div>
		</div>
	</section>

	<section class="bg-bg-elev border border-border rounded-2xl p-5">
		<div class="text-[11px] uppercase tracking-[0.08em] text-text-4 mb-4">Defaults</div>
		<div class="grid grid-cols-[140px_1fr] items-center gap-y-4 gap-x-4 text-[13px]">
			<label for="land" class="text-text-3">Landing page</label>
			<select
				id="land"
				bind:value={defaultLanding}
				class="bg-surface border border-border rounded-lg px-3 py-2 outline-none focus:border-border-strong w-full max-w-[260px]"
			>
				{#each landings as l (l.value)}
					<option value={l.value}>{l.label}</option>
				{/each}
			</select>

			<div class="text-text-3">Week starts on</div>
			<div class="inline-flex items-center h-8 bg-surface border border-border rounded-lg p-0.5">
				{#each [{ v: 1, l: 'Monday' }, { v: 0, l: 'Sunday' }] as opt (opt.v)}
					<button
						type="button"
						onclick={() => (weekStartsOn = opt.v)}
						class="px-3 h-full rounded-md text-[12.5px] {weekStartsOn === opt.v
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

	<div class="flex items-center justify-end gap-2">
		<Button type="submit" variant="primary" disabled={!dirty || saving}>
			{saving ? 'Saving…' : 'Save changes'}
		</Button>
	</div>
</form>
