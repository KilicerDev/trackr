<script lang="ts">
  import "@fontsource-variable/inter/index.css";
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

  // Crossfade route changes via the View Transitions API — the bare DOM swap
  // flickers in the WebView. No-op where unsupported. Duration lives in
  // app.css (::view-transition-*).
  onNavigate((navigation) => {
    if (!document.startViewTransition) return;
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
  style="height: env(safe-area-inset-top, 0px)"
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
