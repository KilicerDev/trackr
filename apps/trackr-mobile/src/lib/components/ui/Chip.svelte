<script lang="ts">
  import X from "@lucide/svelte/icons/x";
  import { cn } from "$lib/utils/cn";

  /* Pill chip in two modes: selectable (quick values, filters) and
     removable (picked workers/machines). */

  type Props = {
    label: string;
    selected?: boolean;
    onclick?: () => void;
    onremove?: () => void;
    class?: string;
  };

  let { label, selected = false, onclick, onremove, class: className }: Props = $props();

  const base =
    "inline-flex h-11 items-center gap-1 rounded-lg border px-3.5 text-sm font-medium transition-colors select-none";
  const looks = $derived(
    selected
      ? "border-(--color-accent) bg-(--color-accent-soft) text-(--color-accent-strong)"
      : "border-(--color-border) bg-(--color-bg-subtle) text-(--color-text-muted)",
  );
</script>

{#if onremove}
  <span class={cn(base, looks, "pr-0", className)}>
    <span class="max-w-40 truncate">{label}</span>
    <button
      type="button"
      onclick={onremove}
      class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-(--color-text-light) active:bg-(--color-bg-inset)"
      aria-label="Remove {label}"
    >
      <X size={14} />
    </button>
  </span>
{:else if onclick}
  <button type="button" {onclick} class={cn(base, looks, "active:brightness-95", className)}>
    <span class="max-w-40 truncate">{label}</span>
  </button>
{:else}
  <span class={cn(base, looks, className)}>
    <span class="max-w-40 truncate">{label}</span>
  </span>
{/if}
