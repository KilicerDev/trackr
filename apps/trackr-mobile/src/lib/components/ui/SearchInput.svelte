<script lang="ts">
  import Search from "@lucide/svelte/icons/search";
  import { cn } from "$lib/utils/cn";

  type Props = {
    value?: string;
    placeholder?: string;
    autofocus?: boolean;
    class?: string;
  };

  let {
    value = $bindable(""),
    placeholder,
    autofocus = false,
    class: className,
  }: Props = $props();
</script>

<div class={cn("relative", className)}>
  <Search
    size={16}
    class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-(--color-text-light)"
  />
  <!-- svelte-ignore a11y_autofocus -->
  <input
    type="search"
    bind:value
    {placeholder}
    {autofocus}
    enterkeyhint="search"
    class="h-11 w-full rounded-lg border border-transparent bg-(--color-bg-inset) pr-3 pl-10 text-base text-(--color-text) outline-none placeholder:text-(--color-text-light) focus:border-(--color-accent) focus:bg-(--color-bg-subtle) focus:ring-2 focus:ring-(--color-accent)/40"
  />
</div>
