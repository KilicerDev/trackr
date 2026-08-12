<script lang="ts">
  import type { Snippet } from "svelte";
  import type { Icon } from "@lucide/svelte";
  import { cn } from "$lib/utils/cn";

  /* Ported from web/src/lib/components/ui/EmptyState.svelte. */

  type Props = {
    icon?: typeof Icon;
    title: string;
    description?: string;
    action?: Snippet;
    class?: string;
  };

  let { icon: EmptyIcon, title, description, action, class: className }: Props = $props();
</script>

<div
  class={cn(
    "flex flex-col items-center justify-center gap-3 px-6 py-16 text-center",
    className,
  )}
>
  {#if EmptyIcon}
    <div
      class="inline-flex items-center justify-center rounded-2xl bg-(--color-bg-inset) p-3 text-(--color-text-light)"
    >
      <EmptyIcon size={24} strokeWidth={1.75} />
    </div>
  {/if}
  <div>
    <p class="text-base font-medium text-(--color-text)">{title}</p>
    {#if description}
      <p class="mt-1 text-sm text-(--color-text-muted)">{description}</p>
    {/if}
  </div>
  {#if action}<div class="mt-1">{@render action()}</div>{/if}
</div>
