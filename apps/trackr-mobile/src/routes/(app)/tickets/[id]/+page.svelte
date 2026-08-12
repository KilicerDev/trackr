<script lang="ts">
  import Send from "@lucide/svelte/icons/send";
  import Plus from "@lucide/svelte/icons/plus";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import UserRound from "@lucide/svelte/icons/user-round";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import { tick } from "svelte";
  import { page } from "$app/state";
  import {
    Async,
    Avatar,
    PriorityBars,
    ScreenHeader,
    Skeleton,
  } from "$lib/components/ui";
  import { getTicket, postTicketMessage, updateTicket } from "$lib/api/tickets";
  import type { TicketMessage } from "$lib/api/types";
  import { markRead } from "$lib/api/inbox";
  import { remote } from "$lib/api/remote.svelte";
  import { session } from "$lib/session.svelte";
  import { fullTime } from "$lib/utils/time";
  import {
    TICKET_CATEGORIES,
    TICKET_PRIORITIES,
    TICKET_STATUSES,
    ticketCategoryLabel,
    ticketChannelLabel,
    ticketPriorityMeta,
    ticketStatusDot,
    ticketStatusLabel,
  } from "$lib/utils/tickets";
  import { toast } from "$lib/stores/toast.svelte";
  import { m } from "$lib/paraglide/messages";

  /* Ticket detail — the web app's layout on a phone: id + org meta line,
     26px title, property pills, plain description, then the "Activity"
     timeline (avatar nodes on a rail, surface-colored blocks — internal
     notes in amber), footer meta, and the web-style composer. For agents
     (canEdit) status/priority/category edit via native pickers and the
     assignee pill opens a picker sheet. */

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
  let saving = $state(false);

  /* Messaging scroll behavior: the timeline windows to the newest PAGE
     entries (the API returns everything, so this is render windowing), the
     screen opens scrolled to the newest message, and "show older" reveals
     another PAGE while keeping the current messages anchored in place. */
  const PAGE = 40;
  let visibleCount = $state(PAGE);
  let scrolledFor = $state<string | null>(null);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
  }

  $effect(() => {
    const id = ticketId;
    if (!detail.data || scrolledFor === id) return;
    scrolledFor = id;
    visibleCount = PAGE;
    void tick().then(scrollToBottom);
  });

  async function showOlder() {
    const el = document.documentElement;
    const prevHeight = el.scrollHeight;
    visibleCount += PAGE;
    await tick();
    window.scrollBy(0, el.scrollHeight - prevHeight);
  }

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
      await tick();
      scrollToBottom();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : m.error_generic());
    } finally {
      sending = false;
    }
  }

  async function applyPatch(patch: {
    status?: string;
    priority?: string;
    category?: string;
    assigneeIds?: string[];
  }) {
    const client = session.client;
    if (!client || saving) return;
    saving = true;
    try {
      await updateTicket(client, ticketId, patch);
      await detail.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : m.error_generic());
    } finally {
      saving = false;
    }
  }

  /* iOS shows <select multiple> as a native checkmark list and fires
     `change` per toggle while it's open — committing then would re-render
     under the picker, so the PATCH waits for blur (picker dismissed). */
  function commitAssignees(select: HTMLSelectElement) {
    const current = detail.data?.ticket.assignees ?? [];
    const next = Array.from(select.selectedOptions, (o) => o.value);
    const same =
      next.length === current.length && next.every((id) => current.includes(id));
    if (!same) void applyPatch({ assigneeIds: next });
  }

  function author(authorId: string | null): { name: string; color: string } | null {
    if (!authorId) return null;
    return detail.data?.authors[authorId] ?? null;
  }

  /* Localized system-event text from `meta` — same rendering as the web's
     systemText(); the stored body is only an untranslated fallback. */
  function systemText(msg: TicketMessage): string {
    const meta = msg.meta ?? {};
    const from = String(meta.from ?? "");
    const to = String(meta.to ?? "");
    const names = (ids: unknown) =>
      (Array.isArray(ids) ? ids : [])
        .map((id) => author(String(id))?.name ?? "—")
        .join(", ");
    switch (meta.event) {
      case "status_changed":
        return m.ticket_event_status_changed({
          from: ticketStatusLabel(from),
          to: ticketStatusLabel(to),
        });
      case "priority_changed":
        return m.ticket_event_priority_changed({
          from: ticketPriorityMeta(from).label,
          to: ticketPriorityMeta(to).label,
        });
      case "category_changed":
        return m.ticket_event_category_changed({
          from: ticketCategoryLabel(from),
          to: ticketCategoryLabel(to),
        });
      case "assigned": {
        const parts: string[] = [];
        if (Array.isArray(meta.added) && meta.added.length)
          parts.push(m.ticket_event_assigned({ names: names(meta.added) }));
        if (Array.isArray(meta.removed) && meta.removed.length)
          parts.push(m.ticket_event_unassigned({ names: names(meta.removed) }));
        return parts.join(", ") || msg.body || m.ticket_system_event();
      }
      case "edited": {
        const parts: string[] = [];
        if (meta.subject) parts.push(m.ticket_event_renamed());
        if (meta.tags) parts.push(m.ticket_event_tags_updated());
        return parts.join(", ") || msg.body || m.ticket_system_event();
      }
      default:
        return msg.body || m.ticket_system_event();
    }
  }
</script>

<main
  class="mx-auto flex max-w-lg flex-col px-4"
  style="min-height: 100dvh"
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
      {@const t = data.ticket}
      {@const prio = ticketPriorityMeta(t.priority)}
      {@const assignee = t.assignees.length ? author(t.assignees[0]) : null}
      {@const hiddenCount = Math.max(0, data.messages.length - visibleCount)}
      {@const shown = hiddenCount > 0 ? data.messages.slice(hiddenCount) : data.messages}
      <ScreenHeader title={t.subject} back="/tickets" />

      <!-- Meta line: mono display id + org dot, the web header's first row. -->
      <p class="mt-1.5 flex items-center gap-2 text-[12px] text-(--color-text-muted)">
        <span class="font-mono text-(--color-text-light)">{t.displayId}</span>
        <span class="h-1.5 w-1.5 rounded-full" style="background: {t.orgColor}"></span>
        <span>{t.orgName}</span>
      </p>

      <!-- Property pills (web: status / priority / category / assignee).
           For agents, native pickers sit invisibly over the first three;
           the assignee pill opens a picker sheet. -->
      <div class="mt-4 flex flex-wrap gap-2">
        <label
          class="relative inline-flex items-center gap-1.5 rounded-lg border border-(--color-border) bg-(--color-bg-subtle) px-2.5 py-1.5 text-[14px] text-(--color-text)"
        >
          <span class="h-2 w-2 rounded-full" style="background: {ticketStatusDot(t.status)}"></span>
          {ticketStatusLabel(t.status)}
          {#if data.canEdit}
            <ChevronDown size={13} class="text-(--color-text-light)" />
            <select
              class="absolute inset-0 h-full w-full appearance-none opacity-0"
              value={t.status}
              disabled={saving}
              onchange={(e) => void applyPatch({ status: e.currentTarget.value })}
            >
              {#each TICKET_STATUSES as status (status)}
                <option value={status}>{ticketStatusLabel(status)}</option>
              {/each}
            </select>
          {/if}
        </label>

        <label
          class="relative inline-flex items-center gap-1.5 rounded-lg border border-(--color-border) bg-(--color-bg-subtle) px-2.5 py-1.5 text-[14px] text-(--color-text)"
        >
          <PriorityBars color={prio.color} level={prio.level} />
          {prio.label}
          {#if data.canEdit}
            <ChevronDown size={13} class="text-(--color-text-light)" />
            <select
              class="absolute inset-0 h-full w-full appearance-none opacity-0"
              value={t.priority}
              disabled={saving}
              onchange={(e) => void applyPatch({ priority: e.currentTarget.value })}
            >
              {#each TICKET_PRIORITIES as priority (priority)}
                <option value={priority}>{ticketPriorityMeta(priority).label}</option>
              {/each}
            </select>
          {/if}
        </label>

        <label
          class="relative inline-flex items-center gap-1.5 rounded-lg border border-(--color-border) bg-(--color-bg-subtle) px-2.5 py-1.5 text-[14px] text-(--color-text)"
        >
          {ticketCategoryLabel(t.category)}
          {#if data.canEdit}
            <ChevronDown size={13} class="text-(--color-text-light)" />
            <select
              class="absolute inset-0 h-full w-full appearance-none opacity-0"
              value={t.category}
              disabled={saving}
              onchange={(e) => void applyPatch({ category: e.currentTarget.value })}
            >
              {#each TICKET_CATEGORIES as category (category)}
                <option value={category}>{ticketCategoryLabel(category)}</option>
              {/each}
            </select>
          {/if}
        </label>

        <label
          class="relative inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[14px] {assignee
            ? 'border border-(--color-border) bg-(--color-bg-subtle) text-(--color-text)'
            : 'border border-dashed border-(--color-border) text-(--color-text-muted)'}"
        >
          {#if assignee}
            <Avatar name={assignee.name} color={assignee.color} size={20} />
            {assignee.name}{t.assignees.length > 1 ? ` +${t.assignees.length - 1}` : ""}
          {:else}
            <UserRound size={14} strokeWidth={1.6} />
            {m.ticket_unassigned()}
          {/if}
          {#if data.canEdit}
            <ChevronDown size={13} class="text-(--color-text-light)" />
            <select
              multiple
              class="absolute inset-0 h-full w-full appearance-none opacity-0"
              disabled={saving}
              onblur={(e) => commitAssignees(e.currentTarget)}
            >
              {#each data.assignableUsers as candidate (candidate.id)}
                <option value={candidate.id} selected={t.assignees.includes(candidate.id)}>
                  {candidate.name}
                </option>
              {/each}
            </select>
          {/if}
        </label>
      </div>

      {#if t.description}
        <p
          class="mt-5 text-[14px] leading-relaxed break-words [overflow-wrap:anywhere] whitespace-pre-wrap text-(--color-text)"
        >
          {t.description}
        </p>
      {/if}

      <div class="mt-7 flex-1 pb-4">
        <p class="mb-3 text-[12px] tracking-[0.08em] text-(--color-text-light) uppercase">
          {m.ticket_activity()}
        </p>

        {#if hiddenCount > 0}
          <button
            type="button"
            class="mx-auto mb-4 block rounded-lg border border-(--color-border) px-4 py-1.5 text-[13px] text-(--color-text-muted) transition-colors active:bg-(--color-bg-inset)"
            onclick={() => void showOlder()}
          >
            {m.timeline_show_older({ count: Math.min(PAGE, hiddenCount) })}
          </button>
        {/if}

        <div class="relative space-y-4 pl-7">
          <span class="absolute top-2 bottom-2 left-[10px] w-px bg-(--color-border)" aria-hidden="true"></span>

          {#if hiddenCount === 0}
            <!-- Created node, like the web timeline's first entry. -->
            <div class="relative">
              <span
                class="absolute top-0.5 -left-7 grid h-5 w-5 place-items-center rounded-full border border-(--color-border) bg-(--color-bg-subtle)"
              >
                <Plus size={12} strokeWidth={1.6} class="text-(--color-text-muted)" />
              </span>
              <p class="text-[14px] text-(--color-text-muted)">
                {#if author(t.createdBy)}
                  <span class="font-medium text-(--color-text)">{author(t.createdBy)?.name}</span>
                {/if}
                {m.ticket_created_event()}
                <span class="font-mono text-[12px] text-(--color-text-light)">· {fullTime(t.createdAt)}</span>
              </p>
            </div>
          {/if}

          {#each shown as msg (msg.id)}
            {@const who = author(msg.authorId)}
            <div class="relative">
              <span
                class="absolute top-0.5 -left-7 grid h-5 w-5 place-items-center overflow-hidden rounded-full border border-(--color-border) bg-(--color-bg-subtle)"
              >
                {#if who}
                  <Avatar name={who.name} color={who.color} size={20} />
                {:else}
                  <UserRound size={12} strokeWidth={1.6} class="text-(--color-text-muted)" />
                {/if}
              </span>

              <p class="min-w-0 text-[14px] text-(--color-text-muted)">
                <span class="font-medium text-(--color-text)">{who?.name ?? "—"}</span>
                {#if msg.kind === "system"}
                  {systemText(msg)}
                {/if}
                {#if msg.isInternalNote}
                  <span
                    class="ml-1 rounded border border-[#e9c46a]/30 bg-[#e9c46a]/8 px-1 text-[11px] text-[#e9c46a]"
                  >
                    {m.ticket_internal_note()}
                  </span>
                {/if}
                <span class="font-mono text-[12px] text-(--color-text-light)">· {fullTime(msg.createdAt)}</span>
              </p>

              {#if msg.kind !== "system"}
                <div
                  class="mt-2 min-w-0 rounded-lg border p-3 text-[14px] leading-relaxed break-words [overflow-wrap:anywhere] whitespace-pre-wrap {msg.isInternalNote
                    ? 'border-[#e9c46a]/30 bg-[#e9c46a]/8 text-(--color-text)'
                    : 'border-(--color-border) bg-(--color-bg-subtle) text-(--color-text)'}"
                >
                  {msg.body}
                </div>
              {/if}
            </div>
          {/each}
        </div>

        <!-- Footer meta, same fields the web shows under the timeline. -->
        <div
          class="mt-8 flex flex-wrap gap-x-4 gap-y-1 border-t border-(--color-border) pt-4 text-[12px] text-(--color-text-light)"
        >
          {#if author(t.customerId)}
            <span>
              {m.ticket_meta_reporter()}
              <span class="text-(--color-text-muted)">{author(t.customerId)?.name}</span>
            </span>
          {/if}
          <span>
            {m.ticket_meta_channel()}
            <span class="text-(--color-text-muted)">{ticketChannelLabel(t.channel)}</span>
          </span>
          <span>
            {m.ticket_meta_created()}
            <span class="font-mono text-(--color-text-muted)">{fullTime(t.createdAt)}</span>
          </span>
        </div>
      </div>

      {#if data.canComment}
        <!-- Web composer: one bordered shell, textarea + action bar inside.
             Amber shell while writing an internal note. -->
        <div
          class="sticky bottom-0 -mx-4 border-t border-(--color-border) bg-(--color-bg)/95 px-4 pt-3 backdrop-blur"
          style="padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px))"
        >
          <div
            class="rounded-xl border bg-(--color-bg-subtle) transition-colors {internal
              ? 'border-[#e9c46a]/40 focus-within:border-[#e9c46a]/70'
              : 'border-(--color-border) focus-within:border-(--color-border-strong)'}"
          >
            <textarea
              bind:value={body}
              placeholder={m.ticket_reply_placeholder()}
              rows="1"
              enterkeyhint="send"
              class="max-h-32 min-h-11 w-full resize-none border-0 bg-transparent px-3.5 pt-3 pb-1 text-base leading-relaxed text-(--color-text) outline-none placeholder:text-(--color-text-light)"
            ></textarea>
            <div class="flex items-center gap-1 px-2 pb-2">
              <div class="ml-auto flex items-center gap-1">
                {#if data.canInternalNote}
                  <button
                    type="button"
                    class="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] transition-colors {internal
                      ? 'border-[#e9c46a]/40 bg-[#e9c46a]/15 text-[#e9c46a]'
                      : 'border-transparent bg-transparent text-(--color-text-muted)'}"
                    aria-pressed={internal}
                    onclick={() => (internal = !internal)}
                  >
                    {m.ticket_internal_note()}
                  </button>
                {/if}
                <button
                  type="button"
                  class="grid h-8 w-8 place-items-center rounded-lg bg-(--color-accent) text-(--color-accent-fg) transition-colors disabled:opacity-50"
                  disabled={sending || !body.trim()}
                  aria-label={m.ticket_send()}
                  onclick={() => void send()}
                >
                  {#if sending}
                    <LoaderCircle size={15} class="animate-spin" />
                  {:else}
                    <Send size={15} />
                  {/if}
                </button>
              </div>
            </div>
          </div>
        </div>
      {/if}

    {/snippet}
  </Async>
</main>
