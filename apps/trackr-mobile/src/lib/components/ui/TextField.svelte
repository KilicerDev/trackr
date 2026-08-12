<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";
  import { cn } from "$lib/utils/cn";

  /* Labeled single-line input. text-base (16px) prevents iOS focus zoom. */

  type Props = {
    label?: string;
    value?: string;
    error?: string;
    hint?: string;
    class?: string;
  } & Omit<HTMLInputAttributes, "class" | "value">;

  let {
    label,
    value = $bindable(""),
    error,
    hint,
    class: className,
    ...rest
  }: Props = $props();
</script>

<label class={cn("block", className)}>
  {#if label}
    <span class="mb-1.5 block text-sm font-medium text-(--color-text)">
      {label}
      {#if hint}
        <span class="font-normal text-(--color-text-light)">· {hint}</span>
      {/if}
    </span>
  {/if}
  <input
    bind:value
    class={cn(
      "h-12 w-full rounded-lg border bg-(--color-bg-subtle) px-3 text-base text-(--color-text) outline-none",
      "placeholder:text-(--color-text-light) disabled:opacity-50",
      "focus:border-(--color-accent) focus:ring-2 focus:ring-(--color-accent)/40",
      error ? "border-(--color-status-error-dot)" : "border-(--color-border)",
    )}
    {...rest}
  />
  {#if error}
    <span class="mt-1 block text-xs text-(--color-status-error-text)">{error}</span>
  {/if}
</label>
