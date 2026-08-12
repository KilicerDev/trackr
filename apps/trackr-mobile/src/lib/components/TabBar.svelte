<script lang="ts">
  import Inbox from "@lucide/svelte/icons/inbox";
  import Ticket from "@lucide/svelte/icons/ticket";
  import SquareCheck from "@lucide/svelte/icons/square-check-big";
  import MessagesSquare from "@lucide/svelte/icons/messages-square";
  import Search from "@lucide/svelte/icons/search";
  import { page } from "$app/state";
  import { m } from "$lib/paraglide/messages";
  import { session } from "$lib/session.svelte";

  /* Four role-driven tabs (the German spec: never more than four). The set
     comes from the server's capability manifest, not a client role heuristic:
     staff → Inbox · Tickets · Tasks · Suche; a customer (no project access)
     gets Chat in place of Tasks when their org has chat. */

  const tabs = $derived.by(() => {
    const caps = session.capabilities;
    const surfaces = caps?.surfaces;
    const list = [
      { href: "/", label: m.tab_inbox(), icon: Inbox, badge: session.unread },
    ];
    if (surfaces?.tickets ?? true) {
      list.push({ href: "/tickets", label: m.tab_tickets(), icon: Ticket, badge: 0 });
    }
    if (surfaces?.tasks) {
      list.push({ href: "/tasks", label: m.tab_tasks(), icon: SquareCheck, badge: 0 });
    } else if (surfaces?.chat) {
      list.push({ href: "/chat", label: m.tab_chat(), icon: MessagesSquare, badge: 0 });
    }
    list.push({ href: "/search", label: m.tab_search(), icon: Search, badge: 0 });
    return list;
  });

  function isActive(href: string): boolean {
    if (href === "/") return page.url.pathname === "/";
    return page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
  }
</script>

<nav
  class="fixed inset-x-0 bottom-0 z-40 border-t border-(--color-border) bg-(--color-bg-subtle)/95 backdrop-blur"
  style="padding-bottom: env(safe-area-inset-bottom, 0px)"
>
  <div class="mx-auto flex max-w-lg">
    {#each tabs as tab (tab.href)}
      {@const active = isActive(tab.href)}
      <a
        href={tab.href}
        class="relative flex h-14 flex-1 flex-col items-center justify-center gap-1 transition-colors {active
          ? 'text-(--color-text)'
          : 'text-(--color-text-light)'}"
        aria-current={active ? "page" : undefined}
      >
        <span class="relative">
          <tab.icon size={20} strokeWidth={active ? 2.25 : 2} />
          {#if tab.badge > 0}
            <span
              class="absolute -top-1.5 -right-2.5 min-w-4 rounded-full bg-(--color-accent) px-1 text-center text-[9px] leading-4 font-semibold text-(--color-accent-fg)"
            >
              {tab.badge > 99 ? "99+" : tab.badge}
            </span>
          {/if}
        </span>
        <span class="text-[10px] font-medium tracking-wide">{tab.label}</span>
      </a>
    {/each}
  </div>
</nav>
