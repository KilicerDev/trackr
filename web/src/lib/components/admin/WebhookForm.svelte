<script lang="ts">
	// The subscription fields, rendered inside a parent <form>. Used by the
	// create modal and the detail page's endpoint card — same input names both
	// ways, parsed by parseSubscriptionForm on the server. The pickers emit
	// hidden inputs (events / orgs / projects / assignee).
	import { untrack } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import { WEBHOOK_EVENTS, WEBHOOK_EVENT_GROUPS } from '$lib/webhooks/events';
	import { WEBHOOK_EVENT_DESCRIPTIONS, WEBHOOK_GROUP_LABELS } from '$lib/webhooks/labels';
	import PickerSelect, {
		type PickerGroup,
		type PickerOption
	} from '$lib/components/PickerSelect.svelte';

	export type WebhookFormOptions = {
		orgs: { id: string; name: string; key: string; isInternal: boolean }[];
		projects: { id: string; key: string; name: string; orgId: string | null }[];
		users: { id: string; name: string }[];
	};
	export type WebhookFormValues = {
		name: string;
		url: string;
		description: string | null;
		eventTypes: string[];
		orgIds: string[] | null;
		projectIds: string[] | null;
		assigneeUserId: string | null;
		includeInternalMessages: boolean;
	};

	interface Props {
		options: WebhookFormOptions;
		initial?: WebhookFormValues | null;
		/** Autofocus the name field (create modal). */
		autofocus?: boolean;
	}
	let { options, initial = null, autofocus = false }: Props = $props();

	const INTERNAL = 'internal';

	// Initial values only: the parent re-mounts this component ({#key}) when the
	// saved row changes, so capturing `initial` once is intended.
	const init = untrack(() => initial);
	let name = $state(init?.name ?? '');
	let url = $state(init?.url ?? '');
	let description = $state(init?.description ?? '');
	let events = $state<string[]>(init?.eventTypes ?? []);
	let orgs = $state<string[]>(init?.orgIds ?? []);
	let projects = $state<string[]>(init?.projectIds ?? []);
	let assignee = $state<string[]>(init?.assigneeUserId ? [init.assigneeUserId] : []);
	let includeInternal = $state(init?.includeInternalMessages ?? false);

	const wantsMessages = $derived(events.includes('ticket.message_created'));

	const eventGroups: PickerGroup[] = WEBHOOK_EVENT_GROUPS.map((g) => ({
		id: g,
		label: WEBHOOK_GROUP_LABELS[g](),
		note: g === 'chat' ? m.webhooks_group_chat_note() : undefined
	}));
	const eventOptions: PickerOption[] = WEBHOOK_EVENTS.map((e) => ({
		value: e.type,
		label: e.type,
		description: WEBHOOK_EVENT_DESCRIPTIONS[e.type](),
		group: e.group,
		mono: true
	}));
	const orgOptions = $derived<PickerOption[]>([
		{ value: INTERNAL, label: m.webhooks_filter_internal_projects() },
		...options.orgs.map((o) => ({ value: o.id, label: o.name, hint: o.key }))
	]);
	const projectOptions = $derived<PickerOption[]>(
		options.projects.map((p) => ({ value: p.id, label: p.name, hint: p.key }))
	);
	const userOptions = $derived<PickerOption[]>(
		options.users.map((u) => ({ value: u.id, label: u.name }))
	);
</script>

<div class="space-y-5">
	<div class="grid gap-3">
		<label class="block">
			<span class="mb-1 block text-[12px] tracking-[0.08em] text-text-4 uppercase"
				>{m.webhooks_field_name()}</span
			>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				name="name"
				bind:value={name}
				required
				maxlength="120"
				{autofocus}
				placeholder={m.webhooks_field_name_placeholder()}
				class="h-9 w-full rounded-lg border border-border bg-surface px-3 text-[14px] outline-none focus:border-border-strong"
			/>
		</label>
		<label class="block">
			<span class="mb-1 block text-[12px] tracking-[0.08em] text-text-4 uppercase"
				>{m.webhooks_field_url()}</span
			>
			<input
				name="url"
				type="url"
				bind:value={url}
				required
				inputmode="url"
				spellcheck={false}
				placeholder="https://hooks.example.com/trackr"
				class="h-9 w-full rounded-lg border border-border bg-surface px-3 font-mono text-[13px] outline-none focus:border-border-strong"
			/>
			<span class="mt-1 block text-[12px] text-text-4">{m.webhooks_field_url_hint()}</span>
		</label>
		<label class="block">
			<span class="mb-1 block text-[12px] tracking-[0.08em] text-text-4 uppercase"
				>{m.webhooks_field_description()}
				<span class="tracking-normal normal-case">· {m.common_optional()}</span></span
			>
			<input
				name="description"
				bind:value={description}
				maxlength="500"
				placeholder={m.webhooks_field_description_placeholder()}
				class="h-9 w-full rounded-lg border border-border bg-surface px-3 text-[14px] outline-none focus:border-border-strong"
			/>
		</label>
	</div>

	<div>
		<div class="mb-1 flex items-baseline justify-between">
			<span class="text-[12px] tracking-[0.08em] text-text-4 uppercase"
				>{m.webhooks_field_events()}</span
			>
			<span class="text-[12px] text-text-4"
				>{m.webhooks_events_selected({ count: events.length })}</span
			>
		</div>
		<PickerSelect
			name="events"
			multiple
			bind:value={events}
			options={eventOptions}
			groups={eventGroups}
			placeholder={m.webhooks_events_placeholder()}
			searchPlaceholder={m.webhooks_events_search()}
			ariaLabel={m.webhooks_field_events()}
		/>
		{#if wantsMessages}
			<label class="mt-2 flex cursor-pointer items-center gap-2 text-[13px] text-text-2">
				<input
					type="checkbox"
					name="includeInternal"
					bind:checked={includeInternal}
					class="h-3.5 w-3.5 rounded border-border bg-bg-elev text-accent focus:ring-accent/30"
				/>
				{m.webhooks_field_include_internal()}
			</label>
		{/if}
	</div>

	<div>
		<div class="mb-1 text-[12px] tracking-[0.08em] text-text-4 uppercase">
			{m.webhooks_field_filters()}
		</div>
		<p class="mb-2 text-[12px] text-text-4">{m.webhooks_filters_hint()}</p>
		<div class="grid gap-3 sm:grid-cols-3">
			<div>
				<span class="mb-1 block text-[12px] font-medium text-text-2"
					>{m.webhooks_filter_orgs()}</span
				>
				<PickerSelect
					name="orgs"
					multiple
					bind:value={orgs}
					options={orgOptions}
					placeholder={m.webhooks_filter_orgs_placeholder()}
					ariaLabel={m.webhooks_filter_orgs()}
				/>
			</div>
			<div>
				<span class="mb-1 block text-[12px] font-medium text-text-2"
					>{m.webhooks_filter_projects()}</span
				>
				<PickerSelect
					name="projects"
					multiple
					bind:value={projects}
					options={projectOptions}
					placeholder={m.webhooks_filter_projects_placeholder()}
					ariaLabel={m.webhooks_filter_projects()}
				/>
			</div>
			<div>
				<span class="mb-1 block text-[12px] font-medium text-text-2"
					>{m.webhooks_filter_assignee()}</span
				>
				<PickerSelect
					name="assignee"
					bind:value={assignee}
					options={userOptions}
					placeholder={m.webhooks_filter_assignee_any()}
					ariaLabel={m.webhooks_filter_assignee()}
				/>
			</div>
		</div>
	</div>
</div>
