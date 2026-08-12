<script lang="ts">
  import MessagesSquare from "@lucide/svelte/icons/messages-square";
  import { Async, Card, EmptyState, ListRow, ScreenHeader, Skeleton } from "$lib/components/ui";
  import { listThreads } from "$lib/api/chat";
  import { remote } from "$lib/api/remote.svelte";
  import { session } from "$lib/session.svelte";
  import { relativeTime } from "$lib/utils/time";
  import { m } from "$lib/paraglide/messages";

  /* Org chat feed (customer tab; staff reach threads via Inbox/Suche). One
     org is the common case — multi-org users get a simple picker row. */

  let orgId = $state("");
  const chatOrgs = $derived.by(() => {
    const caps = session.capabilities;
    const all = session.me?.orgs ?? [];
    if (!caps) return [];
    if (caps.userType === "staff") return all;
    return all.filter((o) =>
      caps.orgs[o.id]?.permissions.includes("org.chat.read"),
    );
  });
  $effect(() => {
    if (!orgId && chatOrgs.length) orgId = chatOrgs[0].id;
  });

  const threads = remote(
    () => orgId,
    async (client, id) => (id ? listThreads(client, id) : { threads: [] }),
  );
</script>

<main class="mx-auto max-w-lg px-4">
  <ScreenHeader title={m.chat_title()} accent />

  {#if chatOrgs.length > 1}
    <select
      bind:value={orgId}
      class="mt-4 h-11 w-full rounded-xl border border-(--color-border) bg-(--color-bg-subtle) px-3 text-base text-(--color-text)"
    >
      {#each chatOrgs as org (org.id)}
        <option value={org.id}>{org.name}</option>
      {/each}
    </select>
  {/if}

  <div class="mt-4 pb-6">
    <Async remote={threads}>
      {#snippet skeleton()}
        <div class="space-y-3">
          <Skeleton class="h-16" />
          <Skeleton class="h-16" />
        </div>
      {/snippet}
      {#snippet children(data)}
        {#if data.threads.length === 0}
          <EmptyState
            icon={MessagesSquare}
            title={m.chat_empty_title()}
            description={m.chat_empty_body()}
          />
        {:else}
          <Card padding="none" class="divide-y divide-(--color-border-subtle)">
            {#each [...data.threads].reverse() as thread (thread.id)}
              {@const last = thread.messages.at(-1)}
              <ListRow
                title={thread.title ?? "—"}
                subtitle={last
                  ? `${last.body.slice(0, 80)} · ${m.chat_replies({ count: thread.messages.length })}`
                  : undefined}
                href={`/chat/${thread.id}`}
              >
                {#snippet trailing()}
                  <span class="text-xs text-(--color-text-light)">
                    {relativeTime(thread.updatedAt)}
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
