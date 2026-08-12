<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils/cn";

  /* White raised surface on the cream canvas — the app's base container. */

  type Props = {
    padding?: "none" | "sm" | "md" | "lg";
    class?: string;
    children: Snippet;
  };

  let { padding = "md", class: className, children }: Props = $props();

  const paddings = {
    none: "",
    sm: "p-3",
    md: "p-4",
    lg: "p-5",
  };
</script>

<div
  class={cn(
    "rounded-2xl border border-(--color-border) bg-(--color-bg-subtle) shadow-card",
    paddings[padding],
    className,
  )}
>
  {@render children()}
</div>
