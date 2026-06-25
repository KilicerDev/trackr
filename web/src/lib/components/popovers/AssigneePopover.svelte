<script lang="ts">
	import { clickOutside } from '$lib/actions/clickOutside';
	import { autoPlace } from '$lib/actions/autoPlace';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/config/motion';
	import Avatar from '../Avatar.svelte';
	import Icon from '../Icon.svelte';
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages';

	type AssignableUser = {
		id: string;
		name: string;
		email: string;
		initials: string;
		color: string;
		status: 'active' | 'invited' | 'disabled';
	};

	interface Props {
		value: string[];
		onchange: (v: string[]) => void;
		onclose: () => void;
		users?: AssignableUser[];
	}
	let { value, onchange, onclose, users: providedUsers }: Props = $props();

	let q = $state('');

	let users = $derived.by(() => {
		const source: AssignableUser[] =
			providedUsers ?? (page.data as { users?: AssignableUser[] }).users ?? [];
		const list = source.filter((u) => u.status !== 'disabled');
		if (!q) return list;
		const needle = q.toLowerCase();
		return list.filter(
			(u) => u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle)
		);
	});

	function toggle(id: string) {
		const has = value.includes(id);
		onchange(has ? value.filter((x) => x !== id) : [...value, id]);
	}
</script>

<div
	use:clickOutside={onclose}
	use:autoPlace
	in:fly={POPOVER_IN}
	class="absolute top-full z-50 mt-1.5 min-w-[260px] rounded-[10px] border border-border bg-bg-elev p-1.5"
	style:box-shadow="var(--shadow-lg)"
>
	<div class="mb-1.5 flex items-center gap-2 border-b border-border px-2 pt-1 pb-2">
		<span class="text-text-3"><Icon name="search" size={13} /></span>
		<input
			type="text"
			bind:value={q}
			placeholder={m.tasks_assign_to_placeholder()}
			class="flex-1 border-0 bg-transparent text-[13px] outline-none placeholder:text-text-3"
		/>
	</div>
	<div class="max-h-[280px] overflow-y-auto">
		{#each users as u (u.id)}
			<button
				type="button"
				onclick={() => toggle(u.id)}
				class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-text-2 hover:bg-surface-2 hover:text-text"
			>
				<Avatar user={u} size={22} />
				<span class="text-[13px]">{u.name}</span>
				<span class="ml-auto text-accent {value.includes(u.id) ? 'opacity-100' : 'opacity-0'}">
					<Icon name="check" size={13} />
				</span>
			</button>
		{/each}
	</div>
</div>
