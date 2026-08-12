<script lang="ts">
  import { cn } from "$lib/utils/cn";

  type Props = { class?: string };

  let { class: className }: Props = $props();
</script>

<div
  class={cn(
    "animate-pulse rounded-2xl border border-(--color-border) bg-(--color-bg-subtle)",
    className,
  )}
></div>
