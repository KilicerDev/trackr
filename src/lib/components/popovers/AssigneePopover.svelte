<script lang="ts">
	import { clickOutside } from '$lib/actions/clickOutside';
	import { autoPlace } from '$lib/actions/autoPlace';
	import { fly } from 'svelte/transition';
	import { POPOVER_IN } from '$lib/motion';
	import Avatar from '../Avatar.svelte';
	import Icon from '../Icon.svelte';
	import { TRACKR_USERS } from '$lib/data';

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
		const source: AssignableUser[] = providedUsers ?? TRACKR_USERS;
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
	class="absolute top-full mt-1.5 z-50 bg-bg-elev border border-border rounded-[10px] p-1.5 min-w-[260px]"
	style:box-shadow="var(--shadow-lg)"
>
	<div class="flex items-center gap-2 px-2 pt-1 pb-2 border-b border-border mb-1.5">
		<span class="text-text-3"><Icon name="search" size={13} /></span>
		<input
			type="text"
			bind:value={q}
			placeholder="Assign to…"
			class="flex-1 bg-transparent border-0 outline-none text-[13px] placeholder:text-text-3"
		/>
	</div>
	<div class="max-h-[280px] overflow-y-auto">
		{#each users as u (u.id)}
			<button
				type="button"
				onclick={() => toggle(u.id)}
				class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-text-2 hover:text-text"
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
