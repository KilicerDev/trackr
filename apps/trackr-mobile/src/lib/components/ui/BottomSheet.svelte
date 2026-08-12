<script lang="ts">
  import type { Snippet } from "svelte";
  import { fade, fly } from "svelte/transition";
  import X from "@lucide/svelte/icons/x";
  import { viewport } from "$lib/viewport.svelte";
  import { m } from "$lib/paraglide/messages";

  /* Foundation for all pickers and creation flows. Keyboard-aware: the panel
     pads itself by the visual-viewport inset so inputs stay visible. Form
     sheets should set `dismissible={false}` so a stray backdrop tap can't
     discard input. */

  type Props = {
    open?: boolean;
    title?: string;
    /** 'auto' hugs content; 'full' takes ~92% of the visible height. */
    height?: "auto" | "full";
    dismissible?: boolean;
    onclose?: () => void;
    footer?: Snippet;
    children: Snippet;
  };

  let {
    open = $bindable(false),
    title,
    height = "auto",
    dismissible = true,
    onclose,
    footer,
    children,
  }: Props = $props();

  function close() {
    open = false;
    onclose?.();
  }

  // Lock background scroll while the sheet is up.
  let settledY = 0;
  $effect(() => {
    if (!open) return;
    settledY = window.scrollY;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  });

  // WKWebView pans the page (not the DOM) to reveal a focused input, which
  // drags the fixed-position sheet down behind the keyboard even though the
  // sheet already pads itself above it. Settle the pan back once the layout
  // has re-rendered — the input is visible again at the settled offset, so
  // iOS has no reason to fight the reset. Same belt and braces as the login
  // screen.
  $effect(() => {
    if (!open) return;
    void viewport.keyboardInset;
    requestAnimationFrame(() => window.scrollTo(0, settledY));
  });

  // The overlay is sized and positioned to the *visual* viewport rather than
  // filling the layout viewport: when the iOS keyboard opens, WKWebView pans
  // the page in the native scroll view (beyond the DOM scroll extent, so
  // window.scrollTo can't undo it) and a plain `fixed inset-0` overlay gets
  // dragged down behind the keyboard. Following vv.height + vv.offsetTop
  // keeps the sheet glued to the visible area wherever iOS pans.
  const overlayHeight = $derived(
    viewport.height > 0 ? `${Math.round(viewport.height)}px` : "100dvh",
  );
  const maxHeight = $derived(
    viewport.height > 0 ? `${Math.round(viewport.height * 0.92)}px` : "92dvh",
  );

  // Swipe-down on the grabber/header to dismiss. The WebView gets no native
  // sheet gestures, so the drag is ours; disabled alongside `dismissible` so
  // form sheets can't lose input to a stray swipe.
  let dragging = $state(false);
  let dragY = $state(0);
  let dragStartY = 0;
  let dragStartedAt = 0;

  function onDragStart(event: PointerEvent) {
    if (!dismissible) return;
    // Let the close button take taps; capture would swallow its click.
    if ((event.target as HTMLElement).closest("button")) return;
    dragging = true;
    dragY = 0;
    dragStartY = event.clientY;
    dragStartedAt = performance.now();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onDragMove(event: PointerEvent) {
    if (!dragging) return;
    dragY = Math.max(0, event.clientY - dragStartY);
  }

  function onDragEnd() {
    if (!dragging) return;
    const elapsed = Math.max(1, performance.now() - dragStartedAt);
    const shouldClose = dragY > 120 || dragY / elapsed > 0.5;
    dragging = false;
    dragY = 0;
    if (shouldClose) close();
  }
</script>

{#if open}
  <div
    class="fixed inset-x-0 top-0 z-50"
    style="height: {overlayHeight}; transform: translateY({viewport.offsetTop}px)"
  >
    <button
      type="button"
      class="absolute inset-0 bg-black/40"
      transition:fade={{ duration: 150 }}
      onclick={() => dismissible && close()}
      aria-label={m.common_close()}
      tabindex="-1"
    ></button>

    <div
      class="absolute inset-x-0 bottom-0 flex flex-col rounded-t-3xl bg-(--color-bg) shadow-soft"
      style="max-height: {maxHeight}; {height === 'full'
        ? `height: ${maxHeight};`
        : ''} padding-bottom: {viewport.keyboardOpen
        ? '0px'
        : 'env(safe-area-inset-bottom, 0px)'}; transform: translateY({dragY}px); transition: {dragging
        ? 'none'
        : 'transform 200ms ease'}"
      transition:fly={{ y: 480, duration: 260 }}
      role="dialog"
      aria-modal="true"
    >
      <div
        class="shrink-0 touch-none"
        role="presentation"
        onpointerdown={onDragStart}
        onpointermove={onDragMove}
        onpointerup={onDragEnd}
        onpointercancel={onDragEnd}
      >
        <div class="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-(--color-border-strong)"></div>

        {#if title}
          <div class="flex items-center justify-between gap-3 px-5 pt-3 pb-1">
            <h2 class="truncate text-lg font-semibold text-(--color-text)">{title}</h2>
            <button
              type="button"
              onclick={close}
              class="-my-1 -mr-2.5 flex h-10 w-10 items-center justify-center rounded-full text-(--color-text-muted) active:bg-(--color-bg-inset)"
              aria-label={m.common_close()}
            >
              <X size={20} />
            </button>
          </div>
        {/if}
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-5 pt-2 pb-5">
        {@render children()}
      </div>

      {#if footer}
        <div class="shrink-0 border-t border-(--color-border) bg-(--color-bg) px-5 py-3">
          {@render footer()}
        </div>
      {/if}
    </div>
  </div>
{/if}
