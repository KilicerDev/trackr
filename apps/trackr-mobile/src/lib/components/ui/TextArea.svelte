<script lang="ts">
  import type { HTMLTextareaAttributes } from "svelte/elements";
  import { cn } from "$lib/utils/cn";

  type Props = {
    label?: string;
    value?: string;
    hint?: string;
    class?: string;
  } & Omit<HTMLTextareaAttributes, "class" | "value">;

  let {
    label,
    value = $bindable(""),
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
  <textarea
    bind:value
    rows={3}
    class={cn(
      "w-full resize-none rounded-lg border border-(--color-border) bg-(--color-bg-subtle) px-3 py-2.5 text-base text-(--color-text) outline-none",
      "placeholder:text-(--color-text-light) disabled:opacity-50",
      "focus:border-(--color-accent) focus:ring-2 focus:ring-(--color-accent)/40",
    )}
    {...rest}
  ></textarea>
</label>
