<script lang="ts">
  import type { Icon } from "@lucide/svelte";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import { cn } from "$lib/utils/cn";

  /* Canonical "tap to pick" trigger for sheet-based pickers (site, inventory
     item, …): 48px bordered row with leading icon, value or placeholder, and
     a chevron. One look for every picker in the app. */

  type Props = {
    label?: string;
    required?: boolean;
    icon?: typeof Icon;
    /** Current selection's display text; empty shows the placeholder. */
    value: string;
    placeholder: string;
    onclick: () => void;
    class?: string;
  };

  let {
    label,
    required = false,
    icon: LeadingIcon,
    value,
    placeholder,
    onclick,
    class: className,
  }: Props = $props();
</script>

<div class={className}>
  {#if label}
    <p class="mb-1.5 text-sm font-medium text-(--color-text)">
      {label}{#if required}<span class="text-(--color-accent-strong)">*</span>{/if}
    </p>
  {/if}
  <button
    type="button"
    {onclick}
    class={cn(
      "flex h-12 w-full items-center gap-3 rounded-lg border border-(--color-border)",
      "bg-(--color-bg-subtle) px-3 text-left active:bg-(--color-bg-inset)",
    )}
  >
    {#if LeadingIcon}
      <LeadingIcon
        size={18}
        class={value ? "text-(--color-accent-strong)" : "text-(--color-text-light)"}
      />
    {/if}
    <span
      class="min-w-0 flex-1 truncate text-base {value
        ? 'text-(--color-text)'
        : 'text-(--color-text-light)'}"
    >
      {value || placeholder}
    </span>
    <ChevronDown size={18} class="shrink-0 text-(--color-text-light)" />
  </button>
</div>
