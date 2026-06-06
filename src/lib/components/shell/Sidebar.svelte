<script lang="ts">
    import { page } from "$app/state";
    import Icon from "../Icon.svelte";
    import Kbd from "../Kbd.svelte";
    import { m } from "$lib/paraglide/messages";

    type LayoutShape = {
        taskCount?: number;
        projects?: { id: string; key: string; name: string; color: string }[];
        favoriteProjectIds?: string[];
        isAdmin?: boolean;
        isTrackrTeam?: boolean;
    };

    const taskCount = $derived((page.data as LayoutShape).taskCount ?? 0);
    const projectList = $derived((page.data as LayoutShape).projects ?? []);
    const favoriteIds = $derived(
        new Set((page.data as LayoutShape).favoriteProjectIds ?? [])
    );
    const favorites = $derived(projectList.filter((p) => favoriteIds.has(p.id)));
    const isAdmin = $derived(!!(page.data as LayoutShape).isAdmin);
    const isTrackrTeam = $derived(!!(page.data as LayoutShape).isTrackrTeam);

    const workspaceItems = $derived([
        { key: "week", label: m.shell_nav_week(), icon: "calendar", href: "/week" },
        {
            key: "tickets",
            label: m.shell_nav_tickets(),
            icon: "ticket",
            href: "/tickets",
        },
        {
            key: "projects",
            label: m.shell_nav_projects(),
            icon: "folder",
            href: "/projects",
            count: projectList.length,
        },
        {
            key: "tasks",
            label: m.shell_nav_tasks(),
            icon: "check-square",
            href: "/tasks",
            count: taskCount,
        },
        // Wiki is internal-only — hidden from client / external-org users.
        ...(isTrackrTeam
            ? [{ key: "wiki", label: m.shell_nav_wiki(), icon: "book", href: "/wiki" }]
            : []),
    ]);

    const adminItems = $derived([
        {
            key: "orgs",
            label: m.shell_admin_organizations(),
            icon: "org",
            href: "/admin/organizations",
        },
        { key: "roles", label: m.shell_admin_roles(), icon: "shield", href: "/admin/roles" },
        {
            key: "users",
            label: m.shell_admin_user_management(),
            icon: "users",
            href: "/admin/users",
        },
        {
            key: "settings",
            label: m.shell_admin_system_settings(),
            icon: "settings",
            href: "/admin/settings",
        },
        { key: "logs", label: m.shell_admin_logs(), icon: "logs", href: "/admin/logs" },
    ]);

    function isActive(href: string): boolean {
        if (href === "/") return page.url.pathname === "/";
        return page.url.pathname.startsWith(href);
    }
</script>

<aside
    class="bg-bg-elev border-r border-border flex flex-col min-h-0"
    style:width="var(--sidebar-w)"
>
    <div
        class="flex items-center gap-2.5 px-[18px] pt-[18px] pb-[14px] text-[15px] font-semibold tracking-[-0.01em]"
    >
        <span class="grid place-items-center w-6 h-6 shrink-0" aria-hidden="true">
            <svg
                width="22"
                height="22"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <rect x="1.26971" y="1.2627" width="3.65721" height="13.4566" rx="1" fill="#FF4867" />
                <rect x="6.146" y="1.2627" width="3.65721" height="13.4566" rx="1" fill="#FF4867" />
                <rect x="11.0223" y="1.2627" width="3.65721" height="13.4566" rx="1" fill="#FF4867" />
            </svg>
        </span>
        Trackr
        <span class="ml-auto text-[10.5px] text-text-3 font-mono font-normal"
            >v2</span
        >
    </div>

    <button
        type="button"
        onclick={() => window.dispatchEvent(new CustomEvent("trackr:open-palette"))}
        class="mx-3 mb-3.5 mt-1 flex items-center gap-2 bg-surface border border-border rounded-lg px-2.5 py-2 text-text-3 text-[14px] hover:text-text-2 transition-colors"
    >
        <Icon name="search" size={14} />
        {m.shell_search_placeholder()}
        <span class="ml-auto"><Kbd>⌘K</Kbd></span>
    </button>

    <div class="flex-1 overflow-y-auto px-2 pb-2">
        <div class="py-1.5">
            <div
                class="px-3 pt-2.5 pb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-text-4"
            >
                {m.shell_section_workspace()}
            </div>
            {#each workspaceItems as item (item.key)}
                {@const active = isActive(item.href)}
                <a
                    href={item.href}
                    class="relative flex items-center gap-2.5 px-3 py-[7px] rounded-[7px] mx-1 my-[1px] text-text-2 hover:bg-[var(--row-hover)] hover:text-text transition-colors text-[14px]
					{active ? 'bg-[var(--row-active)] !text-text' : ''}"
                >
                    {#if active}<span
                            class="absolute left-[-4px] top-2 bottom-2 w-[2px] bg-accent rounded-sm"
                        ></span>{/if}
                    <span
                        class="grid place-items-center w-4 h-4 {active
                            ? 'text-accent'
                            : 'text-text-3'}"
                    >
                        <Icon name={item.icon} size={15} />
                    </span>
                    {item.label}
                    {#if item.count !== undefined}
                        <span class="ml-auto font-mono text-[11px] text-text-3"
                            >{item.count}</span
                        >
                    {/if}
                </a>
            {/each}
        </div>

        <div class="py-1.5">
            <div
                class="px-3 pt-2.5 pb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-text-4"
            >
                {m.shell_section_favorites()}
            </div>
            {#each favorites as p (p.id)}
                <a
                    href="/projects/{p.id}"
                    class="flex items-center gap-2.5 px-3 py-[7px] rounded-[7px] mx-1 my-[1px] text-text-2 hover:bg-[var(--row-hover)] hover:text-text transition-colors text-[14px]"
                >
                    <span
                        class="w-2 h-2 rounded-[2.5px] shrink-0"
                        style:background={p.color}
                    ></span>
                    <span class="truncate">{p.name}</span>
                </a>
            {/each}
            {#if favorites.length === 0}
                <div class="px-3 py-1.5 text-[12px] text-text-4 leading-snug">
                    {m.shell_favorites_empty()}
                </div>
            {/if}
        </div>

        {#if isAdmin}
        <div class="py-1.5">
            <div
                class="px-3 pt-2.5 pb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-text-4"
            >
                {m.shell_section_admin()}
            </div>
            {#each adminItems as item (item.key)}
                {@const active = isActive(item.href)}
                <a
                    href={item.href}
                    class="relative flex items-center gap-2.5 px-3 py-[7px] rounded-[7px] mx-1 my-[1px] text-text-2 hover:bg-[var(--row-hover)] hover:text-text transition-colors text-[14px]
					{active ? 'bg-[var(--row-active)] !text-text' : ''}"
                >
                    {#if active}<span
                            class="absolute left-[-4px] top-2 bottom-2 w-[2px] bg-accent rounded-sm"
                        ></span>{/if}
                    <span
                        class="grid place-items-center w-4 h-4 {active
                            ? 'text-accent'
                            : 'text-text-3'}"
                    >
                        <Icon name={item.icon} size={15} />
                    </span>
                    {item.label}
                </a>
            {/each}
        </div>
        {/if}
    </div>

</aside>
