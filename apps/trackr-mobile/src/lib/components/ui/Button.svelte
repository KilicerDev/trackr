<script lang="ts">
  import type { Snippet } from "svelte";
  import type {
    HTMLAnchorAttributes,
    HTMLButtonAttributes,
  } from "svelte/elements";
  import { cn } from "$lib/utils/cn";

  /* Ported from web/src/lib/components/ui/Button.svelte; adds the `lg` size
     for thumb-friendly primary CTAs. */

  type Variant = "primary" | "dark" | "outline" | "ghost" | "danger";
  type Size = "sm" | "md" | "lg" | "icon";

  type Props = {
    variant?: Variant;
    size?: Size;
    href?: string;
    class?: string;
    children: Snippet;
  } & Omit<HTMLButtonAttributes & HTMLAnchorAttributes, "class" | "children">;

  let {
    variant = "primary",
    size = "md",
    href,
    class: className,
    children,
    ...rest
  }: Props = $props();

  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg border border-transparent font-medium whitespace-nowrap " +
    "transition-colors cursor-pointer disabled:pointer-events-none disabled:opacity-50 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent)/40 " +
    "active:brightness-95";

  const variants: Record<Variant, string> = {
    primary:
      "bg-(--color-accent) text-(--color-accent-fg) hover:bg-(--color-accent-strong)",
    dark: "bg-(--color-dark) text-(--color-dark-fg) hover:bg-(--color-dark-hover)",
    outline:
      "border border-(--color-border) bg-(--color-bg-subtle) text-(--color-text) hover:bg-(--color-bg-inset)",
    ghost:
      "text-(--color-text-muted) hover:bg-(--color-bg-inset) hover:text-(--color-text)",
    danger:
      "bg-(--color-status-error-bg) text-(--color-status-error-text) hover:brightness-95",
  };

  const sizes: Record<Size, string> = {
    sm: "h-8 px-3 text-sm",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-5 text-base",
    icon: "h-10 w-10",
  };

  const cls = $derived(cn(base, variants[variant], sizes[size], className));
</script>

{#if href}
  <a {href} class={cls} {...rest as HTMLAnchorAttributes}>{@render children()}</a>
{:else}
  <button class={cls} {...rest as HTMLButtonAttributes}>{@render children()}</button>
{/if}
