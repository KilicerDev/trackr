<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils/cn";
  import type { StatusTone } from "./types";

  /* Ported 1:1 from web/src/lib/components/ui/StatusBadge.svelte. */

  type Props = {
    tone?: StatusTone;
    dot?: boolean;
    class?: string;
    children: Snippet;
  };

  let { tone = "neutral", dot = true, class: className, children }: Props = $props();

  const tones: Record<StatusTone, string> = {
    neutral: "bg-(--color-status-neutral-bg) text-(--color-status-neutral-text)",
    pending: "bg-(--color-status-pending-bg) text-(--color-status-pending-text)",
    success: "bg-(--color-status-success-bg) text-(--color-status-success-text)",
    error: "bg-(--color-status-error-bg) text-(--color-status-error-text)",
    info: "bg-(--color-status-info-bg) text-(--color-status-info-text)",
  };

  const dots: Record<StatusTone, string> = {
    neutral: "bg-(--color-status-neutral-dot)",
    pending: "bg-(--color-status-pending-dot)",
    success: "bg-(--color-status-success-dot)",
    error: "bg-(--color-status-error-dot)",
    info: "bg-(--color-status-info-dot)",
  };
</script>

<span
  class={cn(
    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
    tones[tone],
    className,
  )}
>
  {#if dot}<span class={cn("h-1.5 w-1.5 rounded-full", dots[tone])}></span>{/if}
  {@render children()}
</span>
