<script lang="ts">
  import type { Snippet } from "svelte";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import { cn } from "$lib/utils/cn";

  /* Tappable row for lists inside a Card (compose with divide-y). 56px min
     height keeps targets thumb-sized. */

  type Props = {
    title: string;
    subtitle?: string;
    href?: string;
    onclick?: () => void;
    chevron?: boolean;
    disabled?: boolean;
    leading?: Snippet;
    trailing?: Snippet;
    class?: string;
  };

  let {
    title,
    subtitle,
    href,
    onclick,
    chevron = false,
    disabled = false,
    leading,
    trailing,
    class: className,
  }: Props = $props();

  const interactive = $derived(!disabled && (href || onclick));

  const cls = $derived(
    cn(
      "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left",
      interactive && "active:bg-(--color-bg-inset) transition-colors",
      disabled && "opacity-50",
      className,
    ),
  );
</script>

{#snippet content()}
  {#if leading}<span class="shrink-0">{@render leading()}</span>{/if}
  <span class="min-w-0 flex-1">
    <span class="block truncate text-sm font-medium text-(--color-text)">
      {title}
    </span>
    {#if subtitle}
      <span class="block truncate text-sm text-(--color-text-muted)">
        {subtitle}
      </span>
    {/if}
  </span>
  {#if trailing}<span class="shrink-0">{@render trailing()}</span>{/if}
  {#if chevron}
    <ChevronRight size={18} class="shrink-0 text-(--color-text-light)" />
  {/if}
{/snippet}

{#if href && !disabled}
  <a {href} class={cls}>{@render content()}</a>
{:else if onclick}
  <button type="button" {onclick} {disabled} class={cls}>
    {@render content()}
  </button>
{:else}
  <div class={cls}>{@render content()}</div>
{/if}
