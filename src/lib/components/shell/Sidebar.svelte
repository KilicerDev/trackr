<script lang="ts">
    import { page } from "$app/state";
    import Icon from "../Icon.svelte";
    import Kbd from "../Kbd.svelte";

    type LayoutShape = {
        taskCount?: number;
        projects?: { id: string; key: string; name: string; color: string }[];
        favoriteProjectIds?: string[];
    };

    const taskCount = $derived((page.data as LayoutShape).taskCount ?? 0);
    const projectList = $derived((page.data as LayoutShape).projects ?? []);
    const favoriteIds = $derived(
        new Set((page.data as LayoutShape).favoriteProjectIds ?? [])
    );
    const favorites = $derived(projectList.filter((p) => favoriteIds.has(p.id)));

    const workspaceItems = $derived([
        { key: "week", label: "My Week", icon: "calendar", href: "/week" },
        {
            key: "tickets",
            label: "Support Tickets",
            icon: "ticket",
            href: "/tickets",
            count: 4,
        },
        {
            key: "projects",
            label: "Projects",
            icon: "folder",
            href: "/projects",
            count: projectList.length,
        },
        {
            key: "tasks",
            label: "Tasks",
            icon: "check-square",
            href: "/tasks",
            count: taskCount,
        },
        { key: "wiki", label: "Wiki", icon: "book", href: "/wiki" },
    ]);

    const adminItems = [
        {
            key: "orgs",
            label: "Organizations",
            icon: "org",
            href: "/admin/organizations",
        },
        { key: "roles", label: "Roles", icon: "shield", href: "/admin/roles" },
        {
            key: "users",
            label: "User Management",
            icon: "users",
            href: "/admin/users",
        },
        {
            key: "settings",
            label: "System Settings",
            icon: "settings",
            href: "/admin/settings",
        },
        { key: "logs", label: "Logs", icon: "logs", href: "/admin/logs" },
    ];

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
        <span
            class="relative w-6 h-6 rounded-[7px] grid place-items-center"
            style:background="linear-gradient(140deg, var(--accent), #d8584b 85%)"
            style:box-shadow="0 1px 0 rgba(255,255,255,0.18) inset, 0 2px 8px rgba(239,122,109,0.25)"
        >
            <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="relative"
            >
                <path d="M4 6h14M4 12h10M4 18h7" />
            </svg>
            <span
                class="absolute inset-0 rounded-[7px]"
                style:background="radial-gradient(circle at 30% 25%, rgba(255,255,255,0.35), transparent 60%)"
            ></span>
        </span>
        Trackr
        <span class="ml-auto text-[10.5px] text-text-3 font-mono font-normal"
            >v2</span
        >
    </div>

    <button
        type="button"
        class="mx-3 mb-3.5 mt-1 flex items-center gap-2 bg-surface border border-border rounded-lg px-2.5 py-2 text-text-3 text-[14px] hover:text-text-2 transition-colors"
    >
        <Icon name="search" size={14} />
        Search…
        <span class="ml-auto"><Kbd>⌘K</Kbd></span>
    </button>

    <div class="flex-1 overflow-y-auto px-2 pb-2">
        <div class="py-1.5">
            <div
                class="px-3 pt-2.5 pb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-text-4"
            >
                Workspace
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
                Favorites
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
                    Star a project to pin it here.
                </div>
            {/if}
        </div>

        <div class="py-1.5">
            <div
                class="px-3 pt-2.5 pb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-text-4"
            >
                Admin
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
    </div>

</aside>
