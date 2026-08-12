<script lang="ts">
  import Bell from "@lucide/svelte/icons/bell";
  import BellOff from "@lucide/svelte/icons/bell-off";
  import { goto } from "$app/navigation";
  import { Async, Avatar, Card, EmptyState, Skeleton } from "$lib/components/ui";
  import { listInbox, markRead } from "$lib/api/inbox";
  import { remote } from "$lib/api/remote.svelte";
  import type { InboxItem } from "$lib/api/types";
  import { session } from "$lib/session.svelte";
  import { relativeTime } from "$lib/utils/time";
  import { m } from "$lib/paraglide/messages";

  /* The notification feed — web notification row anatomy: reserved
     unread-dot slot, 30px actor avatar (bell tile when system-sent), title +
     two-line snippet, compact time. Shared by the external home tab and the
     staff /inbox page. */

  const inbox = remote(
    () => ({}),
    (client) => listInbox(client),
  );

  // Map a notification to an in-app route. Ticket/thread/task ids arrive as
  // entity refs.
  function routeFor(item: InboxItem): string | null {
    if (item.entityType === "ticket" && item.entityId) return `/tickets/${item.entityId}`;
    if (item.entityType === "thread" && item.entityId) return `/chat/${item.entityId}`;
    if (item.entityType === "task" && item.entityId) return `/tasks/${item.entityId}`;
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

{#if session.unread > 0}
  <div class="mb-2 flex justify-end">
    <button
      type="button"
      class="rounded-full px-3 py-1.5 text-[13px] font-medium text-(--color-accent-strong) active:bg-(--color-bg-inset)"
      onclick={() => void markAll()}
    >
      {m.inbox_mark_all()}
    </button>
  </div>
{/if}

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
          {@const actor = item.actorId ? data.actors[item.actorId] : null}
          <button
            type="button"
            class="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors active:bg-(--color-bg-inset) {item.readAt
              ? 'text-(--color-text-muted)'
              : 'text-(--color-text)'}"
            onclick={() => void openItem(item)}
          >
            <span class="mt-2 w-1.5 shrink-0">
              {#if !item.readAt}
                <span class="block h-1.5 w-1.5 rounded-full bg-(--color-accent)"></span>
              {/if}
            </span>
            {#if actor}
              <Avatar name={actor.name} color={actor.color} size={30} />
            {:else}
              <span
                class="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-(--color-bg-inset) text-(--color-text-muted)"
              >
                <Bell size={14} strokeWidth={1.6} />
              </span>
            {/if}
            <span class="min-w-0 flex-1">
              <span class="block text-[14px] font-medium">{item.title}</span>
              {#if item.body}
                <span class="mt-0.5 line-clamp-2 text-[13px] text-(--color-text-muted)">
                  {item.body}
                </span>
              {/if}
            </span>
            <span class="mt-0.5 shrink-0 text-[12px] text-(--color-text-light)">
              {relativeTime(item.createdAt)}
            </span>
          </button>
        {/each}
      </Card>
    {/if}
  {/snippet}
</Async>
