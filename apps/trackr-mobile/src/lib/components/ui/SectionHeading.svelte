<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils/cn";

  /* Uppercase micro-label above a card section. */

  type Props = {
    label: string;
    action?: Snippet;
    class?: string;
  };

  let { label, action, class: className }: Props = $props();
</script>

<div class={cn("mt-6 flex items-center justify-between gap-3", className)}>
  <p class="text-xs font-medium tracking-wide text-(--color-text-light) uppercase">
    {label}
  </p>
  {#if action}{@render action()}{/if}
</div>
