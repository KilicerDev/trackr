<script lang="ts">
  import SearchIcon from "@lucide/svelte/icons/search";
  import { Card, ListRow, ScreenHeader, Skeleton, EmptyState } from "$lib/components/ui";
  import { search } from "$lib/api/search";
  import type { SearchResult } from "$lib/api/types";
  import { session } from "$lib/session.svelte";
  import { m } from "$lib/paraglide/messages";

  /* Global search over everything the role can reach. Wiki / Notizen /
     Projekte are read-only and reachable ONLY from here (deliberate — the
     spec keeps them out of the navigation). Debounced 250ms. */

  let query = $state("");
  let results = $state<SearchResult[] | null>(null);
  let searching = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let gen = 0;

  $effect(() => {
    const q = query.trim();
    clearTimeout(timer);
    if (q.length < 2) {
      results = null;
      searching = false;
      return;
    }
    searching = true;
    timer = setTimeout(async () => {
      const client = session.client;
      if (!client) return;
      const g = ++gen;
      try {
        const res = await search(client, q);
        if (g !== gen) return;
        results = res.results;
      } catch {
        if (g !== gen) return;
        results = [];
      } finally {
        if (g === gen) searching = false;
      }
    }, 250);
    return () => clearTimeout(timer);
  });

  const GROUPS: SearchResult["type"][] = ["ticket", "task", "project", "wiki", "note"];

  function groupLabel(type: SearchResult["type"]): string {
    switch (type) {
      case "ticket":
        return m.search_group_ticket();
      case "task":
        return m.search_group_task();
      case "project":
        return m.search_group_project();
      case "wiki":
        return m.search_group_wiki();
      case "note":
        return m.search_group_note();
    }
  }

  function routeFor(r: SearchResult): string {
    switch (r.type) {
      case "ticket":
        return `/tickets/${r.id}`;
      case "task":
        return "/tasks";
      case "project":
        return `/content/project/${r.id}`;
      case "wiki":
        return `/content/wiki/${r.id}`;
      case "note":
        return `/content/note/${r.id}`;
    }
  }
</script>

<main class="mx-auto max-w-lg px-4">
  <ScreenHeader title={m.search_title()} accent />

  <div class="relative mt-4">
    <SearchIcon
      size={16}
      class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-(--color-text-light)"
    />
    <!-- svelte-ignore a11y_autofocus -->
    <input
      type="search"
      bind:value={query}
      placeholder={m.search_placeholder()}
      autofocus
      autocapitalize="off"
      autocorrect="off"
      spellcheck="false"
      enterkeyhint="search"
      class="h-12 w-full rounded-xl border border-(--color-border) bg-(--color-bg-subtle) pr-3.5 pl-10 text-base text-(--color-text) placeholder:text-(--color-text-light) focus:border-(--color-accent) focus:ring-2 focus:ring-(--color-accent)/40"
    />
  </div>

  <div class="mt-4 pb-6">
    {#if query.trim().length < 2}
      <p class="px-1 text-sm text-(--color-text-light)">{m.search_min_chars()}</p>
    {:else if searching && results === null}
      <div class="space-y-3">
        <Skeleton class="h-14" />
        <Skeleton class="h-14" />
      </div>
    {:else if results && results.length === 0}
      <EmptyState icon={SearchIcon} title={m.search_empty({ query: query.trim() })} />
    {:else if results}
      {#each GROUPS as type (type)}
        {@const group = results.filter((r) => r.type === type)}
        {#if group.length > 0}
          <p class="mt-4 mb-2 px-1 text-xs font-medium tracking-wide text-(--color-text-light) uppercase">
            {groupLabel(type)}
          </p>
          <Card padding="none" class="divide-y divide-(--color-border-subtle)">
            {#each group as result (result.id)}
              <ListRow
                title={result.title}
                subtitle={result.subtitle ?? undefined}
                href={routeFor(result)}
                chevron
              />
            {/each}
          </Card>
        {/if}
      {/each}
    {/if}
  </div>
</main>
