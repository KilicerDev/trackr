<script lang="ts">
  import Bell from "@lucide/svelte/icons/bell";
  import Ticket from "@lucide/svelte/icons/ticket";
  import SquareCheck from "@lucide/svelte/icons/square-check-big";
  import StickyNote from "@lucide/svelte/icons/sticky-note";
  import { Brand, ScreenHeader, Skeleton } from "$lib/components/ui";
  import InboxList from "$lib/components/InboxList.svelte";
  import QuickCreateSheet from "$lib/components/QuickCreateSheet.svelte";
  import { listTickets } from "$lib/api/tickets";
  import { listMyTasks } from "$lib/api/tasks";
  import { remote } from "$lib/api/remote.svelte";
  import { session } from "$lib/session.svelte";
  import { m } from "$lib/paraglide/messages";

  /* Home — staff get the dashboard (stat tiles + quick create, bell → full
     inbox); external users keep the notification feed as their landing tab. */

  const staff = $derived(session.capabilities?.userType === "staff");

  const tickets = remote(
    () => (staff ? "all" : null),
    (client, seg) => (seg ? listTickets(client, seg) : Promise.resolve({ tickets: [] })),
  );
  const tasks = remote(
    () => (staff && session.capabilities?.surfaces.tasks ? {} : null),
    (client, key) => (key ? listMyTasks(client) : Promise.resolve({ tasks: [], users: {} })),
  );

  const OPEN_TICKET = new Set(["open", "in_progress", "waiting_on_customer", "waiting_on_agent", "paused"]);
  const openTickets = $derived(
    (tickets.data?.tickets ?? []).filter((t) => OPEN_TICKET.has(t.status)),
  );
  const myTickets = $derived.by(() => {
    const me = session.user?.id;
    if (!me) return [];
    return openTickets.filter(
      (t) => t.customerId === me || t.createdBy === me || t.assignees.includes(me),
    );
  });
  const openTasks = $derived(
    (tasks.data?.tasks ?? []).filter((t) => t.status !== "done"),
  );

  let quickCreateOpen = $state(false);
  let quickKind = $state<"ticket" | "task" | "note">("ticket");

  function openQuick(kind: "ticket" | "task" | "note") {
    quickKind = kind;
    quickCreateOpen = true;
  }

  const quickActions = $derived.by(() => {
    const qc = session.capabilities?.quickCreate;
    const list: { kind: "ticket" | "task" | "note"; label: string; icon: typeof Ticket }[] = [];
    if (qc?.ticket) list.push({ kind: "ticket", label: m.qc_ticket(), icon: Ticket });
    if (qc?.task) list.push({ kind: "task", label: m.qc_task(), icon: SquareCheck });
    if (qc?.note) list.push({ kind: "note", label: m.qc_note(), icon: StickyNote });
    return list;
  });
</script>

<main class="mx-auto max-w-lg px-4">
  {#if staff}
    <!-- Brand row + bell (web topbar's notification affordance). -->
    <header
      class="flex items-center justify-between"
      style="padding-top: calc(env(safe-area-inset-top, 0px) + 1.25rem)"
    >
      <Brand />
      <a
        href="/inbox"
        class="relative grid h-10 w-10 place-items-center rounded-lg text-(--color-text-muted) transition-colors active:bg-(--color-bg-inset)"
        aria-label={m.inbox_title()}
      >
        <Bell size={19} strokeWidth={1.6} />
        {#if session.unread > 0}
          <span
            class="absolute top-[7px] right-[7px] h-2 w-2 rounded-full bg-(--color-accent) ring-2 ring-(--color-bg)"
          ></span>
        {/if}
      </a>
    </header>

    <!-- Stat tiles (web dashboard tile recipe: bordered surface, 31px
         tabular number, eyebrow label). -->
    <div class="mt-5 grid grid-cols-2 gap-3">
      {#if !tickets.data && !tickets.error}
        <Skeleton class="h-[86px]" />
        <Skeleton class="h-[86px]" />
      {:else}
        <a
          href="/tickets"
          class="rounded-xl border border-(--color-border) bg-(--color-bg-subtle) p-4 transition-colors active:bg-(--color-bg-inset)"
        >
          <p class="text-[31px] leading-none font-semibold text-(--color-text) tabular-nums">
            {openTickets.length}
          </p>
          <p class="mt-2 text-[12px] tracking-[0.08em] text-(--color-text-light) uppercase">
            {m.dash_tickets_open()}
          </p>
        </a>
        <a
          href="/tickets"
          class="rounded-xl border border-(--color-border) bg-(--color-bg-subtle) p-4 transition-colors active:bg-(--color-bg-inset)"
        >
          <p class="text-[31px] leading-none font-semibold text-(--color-text) tabular-nums">
            {myTickets.length}
          </p>
          <p class="mt-2 text-[12px] tracking-[0.08em] text-(--color-text-light) uppercase">
            {m.dash_tickets_mine()}
          </p>
        </a>
      {/if}
      {#if !tasks.data && !tasks.error}
        <Skeleton class="h-[86px]" />
        <Skeleton class="h-[86px]" />
      {:else}
        <a
          href="/tasks"
          class="rounded-xl border border-(--color-border) bg-(--color-bg-subtle) p-4 transition-colors active:bg-(--color-bg-inset)"
        >
          <p class="text-[31px] leading-none font-semibold text-(--color-text) tabular-nums">
            {openTasks.length}
          </p>
          <p class="mt-2 text-[12px] tracking-[0.08em] text-(--color-text-light) uppercase">
            {m.dash_tasks_open()}
          </p>
        </a>
        <a
          href="/inbox"
          class="rounded-xl border border-(--color-border) bg-(--color-bg-subtle) p-4 transition-colors active:bg-(--color-bg-inset)"
        >
          <p class="text-[31px] leading-none font-semibold text-(--color-text) tabular-nums">
            {session.unread}
          </p>
          <p class="mt-2 text-[12px] tracking-[0.08em] text-(--color-text-light) uppercase">
            {m.dash_unread()}
          </p>
        </a>
      {/if}
    </div>

    {#if quickActions.length}
      <p class="mt-7 mb-2 text-[12px] tracking-[0.08em] text-(--color-text-light) uppercase">
        {m.dash_quick_title()}
      </p>
      <div class="flex gap-2 pb-6">
        {#each quickActions as action (action.kind)}
          <button
            type="button"
            class="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-(--color-border) bg-(--color-bg-subtle) text-[14px] font-medium text-(--color-text) transition-colors active:bg-(--color-bg-inset)"
            onclick={() => openQuick(action.kind)}
          >
            <action.icon size={16} strokeWidth={1.6} class="text-(--color-text-muted)" />
            {action.label}
          </button>
        {/each}
      </div>
      <QuickCreateSheet bind:open={quickCreateOpen} bind:kind={quickKind} />
    {/if}
  {:else}
    <ScreenHeader title={m.inbox_title()} />
    <div class="mt-4 pb-6">
      <InboxList />
    </div>
  {/if}
</main>
