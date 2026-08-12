<script lang="ts">
  import { cn } from "$lib/utils/cn";

  /* Inline choice between 2–4 short options (language, view toggles). */

  type Option<T extends string> = { value: T; label: string };

  type Props<T extends string> = {
    options: Option<T>[];
    value?: T;
    onchange?: (value: T) => void;
    class?: string;
  };

  let {
    options,
    value = $bindable(),
    onchange,
    class: className,
  }: Props<string> = $props();

  function select(next: string) {
    if (next === value) return;
    value = next;
    onchange?.(next);
  }
</script>

<div
  class={cn(
    "grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-(--color-bg-inset) p-1",
    className,
  )}
  role="radiogroup"
>
  {#each options as option (option.value)}
    <button
      type="button"
      role="radio"
      aria-checked={option.value === value}
      onclick={() => select(option.value)}
      class={cn(
        "h-10 truncate rounded-lg px-2 text-sm font-medium transition-colors",
        option.value === value
          ? "bg-(--color-bg-subtle) text-(--color-text) shadow-card"
          : "text-(--color-text-muted) active:text-(--color-text)",
      )}
    >
      {option.label}
    </button>
  {/each}
</div>
