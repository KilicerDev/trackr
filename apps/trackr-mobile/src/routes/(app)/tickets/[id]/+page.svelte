<script lang="ts">
  import Send from "@lucide/svelte/icons/send";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import { page } from "$app/state";
  import {
    Async,
    BottomSheet,
    ListRow,
    ScreenHeader,
    Skeleton,
    StatusBadge,
  } from "$lib/components/ui";
  import { getTicket, postTicketMessage, setTicketStatus } from "$lib/api/tickets";
  import { markRead } from "$lib/api/inbox";
  import { remote } from "$lib/api/remote.svelte";
  import { session } from "$lib/session.svelte";
  import { viewport } from "$lib/viewport.svelte";
  import { fullTime } from "$lib/utils/time";
  import {
    TICKET_STATUSES,
    ticketStatusDot,
    ticketStatusLabel,
    ticketStatusTone,
  } from "$lib/utils/tickets";
  import { toast } from "$lib/stores/toast.svelte";
  import { m } from "$lib/paraglide/messages";

  /* Ticket detail: the conversation, a sticky reply composer (the second tap
     of the push→reply path), a status sheet for agents, and the staff-only
     internal-note toggle. Opening the ticket clears its inbox rows. */

  const ticketId = $derived(page.params.id!);

  const detail = remote(
    () => ticketId,
    (client, id) => getTicket(client, id),
  );

  // Clear this ticket's notifications once it's actually open (client effect,
  // never from a load — same rule as the web app).
  $effect(() => {
    const client = session.client;
    const id = ticketId;
    if (!client || !id) return;
    void markRead(client, { entityType: "ticket", entityId: id })
      .then(() => {
        session.unread = Math.max(0, session.unread - 1);
      })
      .catch(() => {});
  });

  let body = $state("");
  let internal = $state(false);
  let sending = $state(false);
  let statusSheetOpen = $state(false);
  let changingStatus = $state(false);

  async function send() {
    const client = session.client;
    const text = body.trim();
    if (!client || !text || sending) return;
    sending = true;
    try {
      await postTicketMessage(client, ticketId, text, internal);
      body = "";
      internal = false;
      await detail.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : m.error_generic());
    } finally {
      sending = false;
    }
  }

  async function changeStatus(status: string) {
    const client = session.client;
    if (!client || changingStatus) return;
    changingStatus = true;
    try {
      await setTicketStatus(client, ticketId, status);
      statusSheetOpen = false;
      await detail.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : m.error_generic());
    } finally {
      changingStatus = false;
    }
  }

  function authorName(authorId: string | null): string {
    if (!authorId) return "—";
    return detail.data?.authors[authorId]?.name ?? "—";
  }
</script>

<main
  class="mx-auto flex max-w-lg flex-col px-4"
  style="min-height: calc(100dvh - env(safe-area-inset-bottom, 0px) - 3.5rem)"
>
  <Async remote={detail}>
    {#snippet skeleton()}
      <div class="space-y-3 pt-16">
        <Skeleton class="h-20" />
        <Skeleton class="h-28" />
        <Skeleton class="h-28" />
      </div>
    {/snippet}
    {#snippet children(data)}
      <ScreenHeader title={data.ticket.subject} back="/tickets">
        {#snippet trailing()}
          {#if data.canEdit}
            <button type="button" onclick={() => (statusSheetOpen = true)}>
              <StatusBadge tone={ticketStatusTone(data.ticket.status)}>
                {ticketStatusLabel(data.ticket.status)}
              </StatusBadge>
            </button>
          {:else}
            <StatusBadge tone={ticketStatusTone(data.ticket.status)}>
              {ticketStatusLabel(data.ticket.status)}
            </StatusBadge>
          {/if}
        {/snippet}
      </ScreenHeader>
      <p class="mt-1 text-sm text-(--color-text-muted)">{data.ticket.orgName}</p>

      <div class="mt-4 flex-1 space-y-3 pb-4">
        {#if data.ticket.description}
          <div
            class="rounded-2xl border border-(--color-border) bg-(--color-bg-subtle) px-4 py-3 text-sm whitespace-pre-wrap text-(--color-text)"
          >
            {data.ticket.description}
          </div>
        {/if}

        {#each data.messages as msg (msg.id)}
          {#if msg.kind === "system"}
            <p class="px-2 text-center text-xs text-(--color-text-light)">
              {msg.body || m.ticket_system_event()} · {fullTime(msg.createdAt)}
            </p>
          {:else}
            {@const mine = msg.authorId === session.user?.id}
            <div class={mine ? "flex justify-end" : "flex justify-start"}>
              <div
                class="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap {msg.isInternalNote
                  ? 'border border-(--color-status-pending-dot)/40 bg-(--color-status-pending-bg) text-(--color-text)'
                  : mine
                    ? 'bg-(--color-accent) text-(--color-accent-fg)'
                    : 'border border-(--color-border) bg-(--color-bg-subtle) text-(--color-text)'}"
              >
                {#if msg.isInternalNote}
                  <p class="mb-0.5 text-[10px] font-semibold tracking-wide uppercase text-(--color-status-pending-text)">
                    {m.ticket_internal_note()}
                  </p>
                {/if}
                {#if !mine}
                  <p class="mb-0.5 text-[11px] font-medium {msg.isInternalNote ? 'text-(--color-status-pending-text)' : 'text-(--color-text-light)'}">
                    {authorName(msg.authorId)}
                  </p>
                {/if}
                {msg.body}
                <p
                  class="mt-1 text-right text-[10px] {mine && !msg.isInternalNote
                    ? 'text-(--color-accent-fg)/70'
                    : 'text-(--color-text-light)'}"
                >
                  {fullTime(msg.createdAt)}
                </p>
              </div>
            </div>
          {/if}
        {/each}
      </div>

      {#if data.canComment}
        <!-- Sticky composer above the tab bar; pads by the keyboard inset so
             it stays visible while typing. -->
        <div
          class="sticky bottom-0 -mx-4 border-t border-(--color-border) bg-(--color-bg)/95 px-4 py-3 backdrop-blur"
          style="padding-bottom: calc(0.75rem + {viewport.keyboardOpen ? '0px' : '0px'})"
        >
          {#if data.canInternalNote}
            <label class="mb-2 flex items-center gap-2 text-xs text-(--color-text-muted)">
              <input type="checkbox" bind:checked={internal} class="h-4 w-4" />
              {m.ticket_internal_note()}
            </label>
          {/if}
          <div class="flex items-end gap-2">
            <textarea
              bind:value={body}
              placeholder={m.ticket_reply_placeholder()}
              rows="1"
              enterkeyhint="send"
              class="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-(--color-border) bg-(--color-bg-subtle) px-3.5 py-2.5 text-base text-(--color-text) placeholder:text-(--color-text-light) focus:border-(--color-accent) focus:ring-2 focus:ring-(--color-accent)/40"
            ></textarea>
            <button
              type="button"
              class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-(--color-accent) text-(--color-accent-fg) disabled:opacity-50"
              disabled={sending || !body.trim()}
              aria-label={m.ticket_send()}
              onclick={() => void send()}
            >
              {#if sending}
                <LoaderCircle size={18} class="animate-spin" />
              {:else}
                <Send size={18} />
              {/if}
            </button>
          </div>
        </div>
      {/if}

      <BottomSheet bind:open={statusSheetOpen} title={m.ticket_change_status()}>
        <div class="divide-y divide-(--color-border-subtle)">
          {#each TICKET_STATUSES as status (status)}
            <ListRow
              title={ticketStatusLabel(status)}
              onclick={() => void changeStatus(status)}
              disabled={changingStatus}
              class={status === data.ticket.status ? "font-semibold" : ""}
            >
              {#snippet leading()}
                <span
                  class="block h-2.5 w-2.5 rounded-full"
                  style="background: {ticketStatusDot(status)}"
                ></span>
              {/snippet}
            </ListRow>
          {/each}
        </div>
      </BottomSheet>
    {/snippet}
  </Async>
</main>
