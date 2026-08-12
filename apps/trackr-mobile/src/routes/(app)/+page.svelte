<script lang="ts">
  import BellOff from "@lucide/svelte/icons/bell-off";
  import LogOut from "@lucide/svelte/icons/log-out";
  import { goto } from "$app/navigation";
  import { Async, Card, EmptyState, ListRow, ScreenHeader, Skeleton } from "$lib/components/ui";
  import { listInbox, markRead } from "$lib/api/inbox";
  import { remote } from "$lib/api/remote.svelte";
  import type { InboxItem } from "$lib/api/types";
  import { session } from "$lib/session.svelte";
  import { relativeTime } from "$lib/utils/time";
  import { m } from "$lib/paraglide/messages";

  /* Inbox — the default tab. "Was wartet auf mich": the notification feed.
     Tapping a row deep-routes into the entity with the reply field one tap
     away (push → thread → answer = two taps). */

  const inbox = remote(
    () => ({}),
    (client) => listInbox(client),
  );

  // Map a notification to an in-app route. Ticket/thread/task ids arrive as
  // entity refs; everything else falls back to search.
  function routeFor(item: InboxItem): string | null {
    if (item.entityType === "ticket" && item.entityId) return `/tickets/${item.entityId}`;
    if (item.entityType === "thread" && item.entityId) return `/chat/${item.entityId}`;
    if (item.entityType === "task" && item.entityId) return `/tasks`;
    return null;
  }

  async function openItem(item: InboxItem) {
    const client = session.client;
    if (client) {
      // Optimistic: clear locally, fire the mark-read, then navigate.
      if (!item.readAt) {
        item.readAt = new Date().toISOString();
        session.unread = Math.max(0, session.unread - 1);
        void markRead(client, { id: item.id }).catch(() => {});
      }
    }
    const route = routeFor(item);
    if (route) void goto(route);
  }

  async function markAll() {
    const client = session.client;
    if (!client) return;
    await markRead(client, { all: true });
    session.unread = 0;
    void inbox.refresh();
  }
</script>

<main class="mx-auto max-w-lg px-4">
  <ScreenHeader title={m.inbox_title()} accent>
    {#snippet trailing()}
      <div class="flex items-center gap-1">
        {#if session.unread > 0}
          <button
            type="button"
            class="rounded-full px-3 py-1.5 text-[13px] font-medium text-(--color-accent-strong) active:bg-(--color-bg-inset)"
            onclick={() => void markAll()}
          >
            {m.inbox_mark_all()}
          </button>
        {/if}
        <button
          type="button"
          class="grid h-9 w-9 place-items-center rounded-full text-(--color-text-light) active:bg-(--color-bg-inset)"
          aria-label={m.shell_signout()}
          onclick={() => void session.signOut()}
        >
          <LogOut size={17} strokeWidth={2} />
        </button>
      </div>
    {/snippet}
  </ScreenHeader>

  <div class="mt-4 pb-6">
    <Async remote={inbox}>
      {#snippet skeleton()}
        <div class="space-y-3">
          <Skeleton class="h-16" />
          <Skeleton class="h-16" />
          <Skeleton class="h-16" />
        </div>
      {/snippet}
      {#snippet children(data)}
        {#if data.items.length === 0}
          <EmptyState
            icon={BellOff}
            title={m.inbox_empty_title()}
            description={m.inbox_empty_body()}
          />
        {:else}
          <Card padding="none" class="divide-y divide-(--color-border-subtle)">
            {#each data.items as item (item.id)}
              <ListRow
                title={item.title}
                subtitle={item.body ?? undefined}
                onclick={() => void openItem(item)}
                class={item.readAt ? "opacity-60" : ""}
              >
                {#snippet leading()}
                  <span
                    class="mt-0.5 block h-2 w-2 rounded-full"
                    style="background: {item.readAt
                      ? 'transparent'
                      : 'var(--color-accent)'}"
                  ></span>
                {/snippet}
                {#snippet trailing()}
                  <span class="text-xs text-(--color-text-light)">
                    {relativeTime(item.createdAt)}
                  </span>
                {/snippet}
              </ListRow>
            {/each}
          </Card>
        {/if}
      {/snippet}
    </Async>
  </div>
</main>
