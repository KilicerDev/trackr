<script lang="ts">
	import { labelMeta } from '$lib/utils/label-meta';
	interface Props {
		id: string;
	}
	let { id }: Props = $props();
	let meta = $derived(labelMeta(id));
</script>

<span
	class="inline-flex items-center gap-1 rounded-[5px] px-[6px] py-[2px] font-mono text-[11px] font-medium"
	style:color={meta.color}
	style:background={meta.color + '24'}
>
	{meta.label}
</span>
