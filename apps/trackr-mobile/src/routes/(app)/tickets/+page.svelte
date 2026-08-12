<script lang="ts">
  import TicketIcon from "@lucide/svelte/icons/ticket";
  import { Async, Card, EmptyState, PriorityBars, ScreenHeader, SegmentedControl, Skeleton } from "$lib/components/ui";
  import { listTickets, type TicketSegment } from "$lib/api/tickets";
  import { remote } from "$lib/api/remote.svelte";
  import { session } from "$lib/session.svelte";
  import { relativeTime } from "$lib/utils/time";
  import { ticketPriorityMeta, ticketStatusDot } from "$lib/utils/tickets";
  import { m } from "$lib/paraglide/messages";

  /* Tickets — Inbox-Logik statt endloser Liste: segmented Für mich /
     Beobachtet / Alle, default "Für mich". Rows follow the web list view's
     single-line anatomy: priority bars, mono display id, status dot,
     subject, last activity. */

  let segment = $state<TicketSegment>("mine");

  // A read.own-only customer sees exactly their tickets in every segment —
  // hide the control instead of offering three identical views.
  const showSegments = $derived.by(() => {
    const caps = session.capabilities;
    if (!caps) return false;
    if (caps.userType === "staff") return true;
    return Object.values(caps.orgs).some((o) =>
      o.permissions.includes("org.tickets.read.any"),
    );
  });

  const tickets = remote(
    () => (showSegments ? segment : "all"),
    (client, seg) => listTickets(client, seg),
  );

  const segments = $derived([
    { value: "mine", label: m.seg_mine() },
    { value: "watched", label: m.seg_watched() },
    { value: "all", label: m.seg_all() },
  ]);
</script>

<main class="mx-auto max-w-lg px-4">
  <ScreenHeader title={m.tickets_title()} />

  {#if showSegments}
    <SegmentedControl
      class="mt-4"
      options={segments}
      value={segment}
      onchange={(v) => (segment = v as TicketSegment)}
    />
  {/if}

  <div class="mt-4 pb-6">
    <Async remote={tickets}>
      {#snippet skeleton()}
        <div class="space-y-3">
          <Skeleton class="h-16" />
          <Skeleton class="h-16" />
          <Skeleton class="h-16" />
        </div>
      {/snippet}
      {#snippet children(data)}
        {#if data.tickets.length === 0}
          <EmptyState
            icon={TicketIcon}
            title={m.tickets_empty_title()}
            description={m.tickets_empty_body()}
          />
        {:else}
          <Card padding="none" class="divide-y divide-(--color-border-subtle)">
            {#each data.tickets as ticket (ticket.id)}
              {@const prio = ticketPriorityMeta(ticket.priority)}
              <a
                href={`/tickets/${ticket.id}`}
                class="flex h-12 items-center gap-3 px-4 text-[14px] transition-colors active:bg-(--color-bg-inset)"
              >
                <PriorityBars color={prio.color} level={prio.level} />
                <span
                  class="max-w-[96px] shrink-0 truncate font-mono text-[12px] text-(--color-text-light)"
                >
                  {ticket.displayId}
                </span>
                <span
                  class="h-2.5 w-2.5 shrink-0 rounded-full"
                  style="background: {ticketStatusDot(ticket.status)}"
                ></span>
                <span class="min-w-0 flex-1 truncate text-(--color-text)">{ticket.subject}</span>
                <span class="shrink-0 font-mono text-[12px] text-(--color-text-light)">
                  {relativeTime(ticket.lastMessageAt ?? ticket.updatedAt)}
                </span>
              </a>
            {/each}
          </Card>
        {/if}
      {/snippet}
    </Async>
  </div>
</main>
