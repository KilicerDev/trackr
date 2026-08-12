<script lang="ts">
  import type { Snippet } from "svelte";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import { cn } from "$lib/utils/cn";

  /* Screen title block below the status bar. Title metrics mirror the web
     app's page h1 (26px semibold, tight tracking, no decoration). */

  type Props = {
    title: string;
    eyebrow?: string;
    /** href string navigates back via link; function renders a button. */
    back?: string | (() => void);
    trailing?: Snippet;
    class?: string;
  };

  let { title, eyebrow, back, trailing, class: className }: Props = $props();
</script>

<!-- The back button floats fixed below the status bar so it never scrolls
     away; the header reserves its height via extra top padding. -->
{#if back !== undefined}
  {#if typeof back === "string"}
    <a
      href={back}
      class="fixed left-3 z-40 grid h-10 w-10 place-items-center rounded-full border border-(--color-border) bg-(--color-bg-subtle)/80 text-(--color-text-muted) backdrop-blur active:bg-(--color-bg-inset)"
      style="top: calc(env(safe-area-inset-top, 0px) + 0.5rem)"
      aria-label="Back"
    >
      <ChevronLeft size={22} />
    </a>
  {:else}
    <button
      type="button"
      onclick={back}
      class="fixed left-3 z-40 grid h-10 w-10 place-items-center rounded-full border border-(--color-border) bg-(--color-bg-subtle)/80 text-(--color-text-muted) backdrop-blur active:bg-(--color-bg-inset)"
      style="top: calc(env(safe-area-inset-top, 0px) + 0.5rem)"
      aria-label="Back"
    >
      <ChevronLeft size={22} />
    </button>
  {/if}
{/if}

<header
  class={cn("flex items-end justify-between gap-3", className)}
  style="padding-top: calc(env(safe-area-inset-top, 0px) + {back !== undefined
    ? '4rem'
    : '1.25rem'})"
>
  <div class="min-w-0">
    {#if eyebrow}
      <p
        class="text-[12px] font-medium tracking-[0.08em] text-(--color-text-light) uppercase"
      >
        {eyebrow}
      </p>
    {/if}
    <h1 class="mt-1 truncate text-[26px] leading-tight font-semibold tracking-[-0.014em] text-(--color-text)">
      {title}
    </h1>
  </div>
  {#if trailing}
    <div class="shrink-0 pb-1">{@render trailing()}</div>
  {/if}
</header>
