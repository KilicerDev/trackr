<script lang="ts">
  import CloudOff from "@lucide/svelte/icons/cloud-off";
  import Plus from "@lucide/svelte/icons/plus";
  import TabBar from "$lib/components/TabBar.svelte";
  import QuickCreateSheet from "$lib/components/QuickCreateSheet.svelte";
  import { Brand, Button, EmptyState } from "$lib/components/ui";
  import { badge } from "$lib/api/inbox";
  import { session } from "$lib/session.svelte";
  import { m } from "$lib/paraglide/messages";

  /* Authenticated shell: page content above the fixed tab bar, plus the
     global + FAB (quick capture). The unread badge polls every 60s while
     the app is foregrounded — the push stand-in until FCM lands. */

  let { children } = $props();

  let quickCreateOpen = $state(false);

  const canQuickCreate = $derived.by(() => {
    const qc = session.capabilities?.quickCreate;
    return !!qc && (qc.ticket || qc.task || qc.note);
  });

  async function pollBadge() {
    const client = session.client;
    if (!client || session.phase !== "signedIn") return;
    try {
      const { unread } = await badge(client);
      session.unread = unread;
    } catch {
      // transient — next tick will retry
    }
  }

  $effect(() => {
    if (session.phase !== "signedIn") return;
    const interval = setInterval(() => void pollBadge(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void pollBadge();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  });
</script>

{#if !session.meLoaded && session.meError}
  <main class="flex min-h-dvh flex-col items-center justify-center px-6">
    <EmptyState
      icon={CloudOff}
      title={m.shell_error_title()}
      description={m.shell_error_body()}
    >
      {#snippet action()}
        <div class="flex flex-col items-center gap-2">
          <Button variant="outline" onclick={() => session.reloadMe()}>
            {m.common_retry()}
          </Button>
          <Button variant="ghost" size="sm" onclick={() => void session.signOut()}>
            {m.shell_signout()}
          </Button>
        </div>
      {/snippet}
    </EmptyState>
  </main>
{:else if !session.meLoaded}
  <main class="flex min-h-dvh items-center justify-center">
    <div class="animate-pulse"><Brand size="lg" /></div>
  </main>
{:else}
  <div
    class="min-h-dvh"
    style="padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 3.5rem)"
  >
    {@render children()}
  </div>

  {#if canQuickCreate}
    <button
      type="button"
      class="fixed right-4 z-40 grid h-13 w-13 place-items-center rounded-full bg-(--color-accent) text-(--color-accent-fg) shadow-soft active:brightness-95"
      style="bottom: calc(env(safe-area-inset-bottom, 0px) + 4.25rem)"
      aria-label={m.qc_title()}
      onclick={() => (quickCreateOpen = true)}
    >
      <Plus size={24} strokeWidth={2.25} />
    </button>
    <QuickCreateSheet bind:open={quickCreateOpen} />
  {/if}

  <TabBar />
{/if}
