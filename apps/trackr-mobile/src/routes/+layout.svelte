<script lang="ts">
  import "@fontsource-variable/geist/index.css";
  import "@fontsource-variable/geist-mono/index.css";
  import "./layout.css";

  import { onMount } from "svelte";
  import { goto, onNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
  import { Brand, ConfirmSheet, Toaster } from "$lib/components/ui";
  import { session } from "$lib/session.svelte";

  let { children } = $props();

  onMount(() => {
    let unlisten: (() => void) | undefined;
    // onOpenUrl also delivers the launch URL, covering cold-start deep links.
    void onOpenUrl((urls) => session.handleDeepLink(urls)).then(
      (fn) => (unlisten = fn),
    );
    void session.restore();
    return () => unlisten?.();
  });

  $effect(() => {
    if (session.phase === "signedOut" && page.url.pathname !== "/login") {
      void goto("/login", { replaceState: true });
    } else if (session.phase === "signedIn" && page.url.pathname === "/login") {
      void goto("/", { replaceState: true });
    }
  });

  // Direction-aware route transitions via the View Transitions API — iOS
  // push/pop: deeper routes slide in from the right, going back slides the
  // old page out to the right. Same-depth switches (tab to tab) crossfade.
  // The keyframes live in app.css, keyed off <html data-nav-dir>.
  function routeDepth(path: string): number {
    return path.split("/").filter(Boolean).length;
  }

  onNavigate((navigation) => {
    if (!document.startViewTransition) return;
    const from = navigation.from?.url.pathname ?? "/";
    const to = navigation.to?.url.pathname ?? "/";
    const dir =
      (navigation.delta ?? 0) < 0
        ? "back"
        : routeDepth(to) > routeDepth(from)
          ? "forward"
          : routeDepth(to) < routeDepth(from)
            ? "back"
            : "same";
    document.documentElement.dataset.navDir = dir;
    // WebKit anchors the old root snapshot at the document top, not the
    // scrolled viewport — record the departing page's scroll so the CSS can
    // shift the snapshot back into place (see --vt-scroll in app.css).
    document.documentElement.style.setProperty("--vt-scroll", `${window.scrollY}px`);
    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });
</script>

<!-- Status-bar scrim: the WebView draws under the notch, so without this
     scrolled content shows through the clock/battery strip. Matches the
     sticky in-page headers (bg/95 + blur) to form one continuous band. -->
<div
  class="pointer-events-none fixed inset-x-0 top-0 z-30 bg-(--color-bg)/95 backdrop-blur"
  style="height: env(safe-area-inset-top, 0px); view-transition-name: status-scrim"
></div>

{#if session.phase === "loading"}
  <main class="flex min-h-dvh items-center justify-center">
    <div class="animate-pulse">
      <Brand size="lg" />
    </div>
  </main>
{:else}
  {@render children()}
{/if}

<ConfirmSheet />
<Toaster />
