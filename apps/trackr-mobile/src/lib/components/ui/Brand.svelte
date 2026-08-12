<script lang="ts">
  import { cn } from "$lib/utils/cn";

  /* Text wordmark on an accent tile — no image assets needed. Mirrors the
     web app's sidebar brand treatment. */

  type Size = "md" | "lg";

  type Props = {
    size?: Size;
    class?: string;
  };

  let { size = "md", class: className }: Props = $props();

  const tileSizes: Record<Size, string> = { md: "h-8 w-8 text-[15px]", lg: "h-9 w-9 text-[17px]" };
  const wordmarkSizes: Record<Size, string> = { md: "text-[17px]", lg: "text-[20px]" };
</script>

<span class={cn("inline-flex shrink-0 items-center gap-2.5", className)}>
  <span
    class={cn(
      "grid shrink-0 place-items-center rounded-lg bg-(--color-accent) font-bold text-(--color-accent-fg)",
      tileSizes[size],
    )}
  >
    T
  </span>
  <span class={cn("font-semibold tracking-[-0.02em] text-(--color-text)", wordmarkSizes[size])}>
    Trackr
  </span>
</span>
