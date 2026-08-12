<script lang="ts">
  import House from "@lucide/svelte/icons/house";
  import Inbox from "@lucide/svelte/icons/inbox";
  import Ticket from "@lucide/svelte/icons/ticket";
  import SquareCheck from "@lucide/svelte/icons/square-check-big";
  import MessagesSquare from "@lucide/svelte/icons/messages-square";
  import StickyNote from "@lucide/svelte/icons/sticky-note";
  import UserRound from "@lucide/svelte/icons/user-round";
  import { page } from "$app/state";
  import { m } from "$lib/paraglide/messages";
  import { session } from "$lib/session.svelte";

  /* Role-driven tabs from the server's capability manifest:
     staff → Home (dashboard, bell → /inbox) · Tickets · Tasks · Notizen ·
     Profil; external → Inbox · Tickets · Chat (if the org has chat) ·
     Profil. */

  const tabs = $derived.by(() => {
    const caps = session.capabilities;
    const surfaces = caps?.surfaces;
    const staff = caps?.userType === "staff";
    if (staff) {
      const list = [
        { href: "/", label: m.tab_home(), icon: House, badge: 0 },
        { href: "/tickets", label: m.tab_tickets(), icon: Ticket, badge: 0 },
      ];
      if (surfaces?.tasks) {
        list.push({ href: "/tasks", label: m.tab_tasks(), icon: SquareCheck, badge: 0 });
      }
      if (surfaces?.wiki || surfaces?.notes) {
        list.push({ href: "/notes", label: m.tab_notes(), icon: StickyNote, badge: 0 });
      }
      list.push({ href: "/profile", label: m.tab_profile(), icon: UserRound, badge: 0 });
      return list;
    }
    const list = [
      { href: "/", label: m.tab_inbox(), icon: Inbox, badge: session.unread },
    ];
    if (surfaces?.tickets ?? true) {
      list.push({ href: "/tickets", label: m.tab_tickets(), icon: Ticket, badge: 0 });
    }
    if (surfaces?.chat) {
      list.push({ href: "/chat", label: m.tab_chat(), icon: MessagesSquare, badge: 0 });
    }
    list.push({ href: "/profile", label: m.tab_profile(), icon: UserRound, badge: 0 });
    return list;
  });

  function isActive(href: string): boolean {
    // /inbox is the dashboard bell's page — keep Home lit while reading it.
    if (href === "/") return page.url.pathname === "/" || page.url.pathname === "/inbox";
    return page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
  }
</script>

<nav
  class="fixed inset-x-0 bottom-0 z-40 border-t border-(--color-border) bg-(--color-bg-subtle)/95 backdrop-blur"
  style="padding-bottom: env(safe-area-inset-bottom, 0px); view-transition-name: tab-bar"
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
