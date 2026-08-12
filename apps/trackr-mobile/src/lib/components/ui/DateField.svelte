<script lang="ts">
  import { cn } from "$lib/utils/cn";

  /* Native date input; value is a literal "YYYY-MM-DD" string. */

  type Props = {
    label?: string;
    value?: string;
    min?: string;
    max?: string;
    required?: boolean;
    disabled?: boolean;
    error?: boolean;
    onchange?: () => void;
    class?: string;
  };

  let {
    label,
    value = $bindable(""),
    min,
    max,
    required = false,
    disabled = false,
    error = false,
    onchange,
    class: className,
  }: Props = $props();
</script>

<label class={cn("block", className)}>
  {#if label}
    <span class="mb-1.5 block text-sm font-medium text-(--color-text)">
      {label}{#if required}<span class="text-(--color-accent-strong)">*</span>{/if}
    </span>
  {/if}
  <input
    type="date"
    bind:value
    {min}
    {max}
    {disabled}
    {onchange}
    class={cn(
      "h-12 w-full rounded-lg border bg-(--color-bg-subtle) px-3 text-base text-(--color-text) outline-none",
      "focus:border-(--color-accent) focus:ring-2 focus:ring-(--color-accent)/40 disabled:opacity-50",
      error ? "border-(--color-status-error-dot)" : "border-(--color-border)",
    )}
  />
</label>
