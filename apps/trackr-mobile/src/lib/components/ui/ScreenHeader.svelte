<script lang="ts">
  import type { Snippet } from "svelte";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import { cn } from "$lib/utils/cn";

  /* Screen title block below the status bar. The serif italic title is the
     brand moment shared with the web app's greetings. */

  type Props = {
    title: string;
    eyebrow?: string;
    /** Appends the brand's accent-colored period to the title (greetings). */
    accent?: boolean;
    /** href string navigates back via link; function renders a button. */
    back?: string | (() => void);
    trailing?: Snippet;
    class?: string;
  };

  let { title, eyebrow, accent = false, back, trailing, class: className }: Props = $props();
</script>

<header
  class={cn("flex items-end justify-between gap-3", className)}
  style="padding-top: calc(env(safe-area-inset-top, 0px) + 1.25rem)"
>
  <div class="min-w-0">
    {#if back !== undefined}
      {#if typeof back === "string"}
        <a
          href={back}
          class="-ml-2.5 mb-1 inline-flex h-10 w-10 items-center justify-center rounded-full text-(--color-text-muted) active:bg-(--color-bg-inset)"
          aria-label="Back"
        >
          <ChevronLeft size={22} />
        </a>
      {:else}
        <button
          type="button"
          onclick={back}
          class="-ml-2.5 mb-1 inline-flex h-10 w-10 items-center justify-center rounded-full text-(--color-text-muted) active:bg-(--color-bg-inset)"
          aria-label="Back"
        >
          <ChevronLeft size={22} />
        </button>
      {/if}
    {/if}
    {#if eyebrow}
      <p
        class="text-xs font-medium tracking-wide text-(--color-text-light) uppercase"
      >
        {eyebrow}
      </p>
    {/if}
    <h1 class="mt-1 truncate text-3xl font-semibold tracking-[-0.02em] text-(--color-text)">
      {title}{#if accent}<span class="text-(--color-accent)">.</span>{/if}
    </h1>
  </div>
  {#if trailing}
    <div class="shrink-0 pb-1">{@render trailing()}</div>
  {/if}
</header>
