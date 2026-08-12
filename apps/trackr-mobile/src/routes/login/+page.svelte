<script lang="ts">
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import Globe from "@lucide/svelte/icons/globe";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import { Brand, Button } from "$lib/components/ui";
  import { displayHost } from "$lib/config";
  import { normalizeServerUrl } from "$lib/server-url";
  import { session } from "$lib/session.svelte";
  import { viewport } from "$lib/viewport.svelte";
  import { m } from "$lib/paraglide/messages";

  /* The server selector swaps the card content instead of layering a sheet or
     modal: fixed overlays fight the iOS keyboard inside the webview (the
     layout viewport becomes pannable), while a plain document flow keyboards
     naturally — same pattern as a forgot-password view on a login page.

     Trackr is self-hosted-first: there is no hosted default, so with no
     stored server the screen opens directly on the server view. */
  let server = $state(session.serverUrl ?? "");
  let view = $state<"signin" | "server">(server ? "signin" : "server");

  let signingIn = $state(false);
  let error = $state<string | null>(null);

  let serverInput = $state(server);
  let serverError = $state<string | null>(null);

  async function signIn() {
    if (!server) {
      openServerConfig();
      return;
    }
    signingIn = true;
    error = null;
    try {
      await session.signInWithWeb(server);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // a restarted attempt supersedes this one — not an error worth showing
      if (message !== "Sign-in was restarted.") error = message;
    } finally {
      signingIn = false;
    }
  }

  function openServerConfig() {
    serverInput = server;
    serverError = null;
    view = "server";
  }

  function saveServer() {
    const trimmed = serverInput.trim();
    if (!trimmed) {
      serverError = m.login_server_required();
      return;
    }
    try {
      normalizeServerUrl(trimmed);
      server = trimmed;
      view = "signin";
    } catch (e) {
      serverError = e instanceof Error ? e.message : String(e);
    }
  }

  // Belt and braces: if the keyboard transition still nudged the native
  // scroll offset (WKWebView pans the page, not the DOM), settle it back
  // once the layout has re-rendered — the input is visible at 0, so iOS
  // has no reason to fight the reset.
  $effect(() => {
    void viewport.keyboardInset;
    requestAnimationFrame(() => window.scrollTo(0, 0));
  });
</script>

<!-- The sign-in view centers; the server view top-aligns so its input sits
     near the top of the screen — WKWebView then never needs to pan the page
     to reveal it when the keyboard opens. -->
<main
  class="flex min-h-dvh flex-col items-center px-5 {view === 'signin'
    ? 'justify-center'
    : 'justify-start'}"
  style="padding-top: max(env(safe-area-inset-top, 0px), {view === 'signin'
    ? '2.5rem'
    : '1rem'}); padding-bottom: max(env(safe-area-inset-bottom, 0px), 1.5rem)"
>
  {#if view === "signin"}
    <Brand size="lg" class="mb-8" />
  {/if}

  <div
    class="w-full max-w-[400px] rounded-2xl border border-(--color-border) bg-(--color-bg-subtle) p-7 shadow-card"
  >
    {#if view === "signin"}
      <h1 class="text-3xl font-semibold tracking-[-0.02em] text-(--color-text)">
        {m.login_title()}<span class="text-(--color-accent)">.</span>
      </h1>
      <p class="mt-2 text-sm text-(--color-text-muted)">
        {m.login_subtitle()}
      </p>

      {#if error}
        <div
          class="mt-5 rounded-lg border border-(--color-status-error-dot)/30 bg-(--color-status-error-bg) px-3 py-2 text-sm text-(--color-status-error-text)"
        >
          {error}
        </div>
      {/if}

      <Button
        size="lg"
        class="mt-6 w-full"
        disabled={signingIn}
        onclick={signIn}
      >
        {#if signingIn}
          <LoaderCircle size={18} class="animate-spin" />
          {m.login_waiting()}
        {:else}
          {m.login_signin()}
        {/if}
      </Button>

      <!-- Bitwarden-style server selector: tap to point the app at another
           self-hosted Trackr instance. -->
      <button
        class="mt-5 flex w-full items-center justify-center gap-1.5"
        onclick={openServerConfig}
        aria-label={m.login_change_server()}
      >
        <Globe
          size={12}
          strokeWidth={2}
          class="shrink-0 text-(--color-text-light)"
        />
        <span class="text-[13px] text-(--color-text-muted)">{m.login_signing_in_to()}</span>
        <span
          class="truncate font-mono text-[13px] text-(--color-accent-strong)"
        >
          {displayHost(server)}
        </span>
        <ChevronRight
          size={12}
          strokeWidth={2.5}
          class="shrink-0 text-(--color-text-light)"
        />
      </button>
    {:else}
      {#if server}
        <button
          class="-ml-1 flex items-center gap-1 text-sm font-medium text-(--color-text-muted) transition-colors hover:text-(--color-text)"
          onclick={() => (view = "signin")}
        >
          <ArrowLeft size={16} strokeWidth={2} />
          {m.common_back()}
        </button>
      {:else}
        <Brand class="mb-1" />
      {/if}

      <h1 class="mt-4 text-3xl font-semibold tracking-[-0.02em] text-(--color-text)">
        {m.login_server_title()}<span class="text-(--color-accent)">.</span>
      </h1>
      <p class="mt-2 text-sm text-(--color-text-muted)">
        {m.login_server_description()}
      </p>

      <!-- svelte-ignore a11y_autofocus -->
      <input
        type="url"
        placeholder="trackr.example.com"
        bind:value={serverInput}
        autofocus
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        inputmode="url"
        enterkeyhint="done"
        onkeydown={(e) => {
          if (e.key === "Enter") saveServer();
        }}
        class="mt-5 h-12 w-full rounded-lg border border-(--color-border) bg-(--color-bg) px-3.5 font-mono text-base text-(--color-text) outline-0 transition-colors placeholder:text-(--color-text-light) focus:border-(--color-accent) focus:ring-2 focus:ring-(--color-accent)/40"
      />

      {#if serverError}
        <div
          class="mt-3 rounded-lg border border-(--color-status-error-dot)/30 bg-(--color-status-error-bg) px-3 py-2 text-sm text-(--color-status-error-text)"
        >
          {serverError}
        </div>
      {/if}

      <Button size="lg" class="mt-5 w-full" onclick={saveServer}>{m.common_save()}</Button>
    {/if}
  </div>
</main>
