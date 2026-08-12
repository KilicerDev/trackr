<script lang="ts">
  import type { Icon } from "@lucide/svelte";
  import { cn } from "$lib/utils/cn";
  import type { IconTone } from "./types";

  /* Rounded icon square — leading element in list rows and cards. */

  type Props = {
    icon: typeof Icon;
    tone?: IconTone;
    size?: "sm" | "md";
    class?: string;
  };

  let { icon: TileIcon, tone = "neutral", size = "md", class: className }: Props = $props();

  const tones: Record<IconTone, string> = {
    gold: "bg-(--color-accent-soft) text-(--color-accent-strong)",
    neutral: "bg-(--color-bg-inset) text-(--color-text-muted)",
    success: "bg-(--color-status-success-bg) text-(--color-status-success-text)",
    error: "bg-(--color-status-error-bg) text-(--color-status-error-text)",
    info: "bg-(--color-status-info-bg) text-(--color-status-info-text)",
  };

  const sizes = {
    sm: "h-9 w-9 rounded-lg",
    md: "h-11 w-11 rounded-xl",
  };
</script>

<span
  class={cn(
    "inline-flex shrink-0 items-center justify-center",
    tones[tone],
    sizes[size],
    className,
  )}
>
  <TileIcon size={size === "sm" ? 16 : 20} strokeWidth={2} />
</span>
