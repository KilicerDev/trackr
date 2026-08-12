<script lang="ts">
  import FileText from "@lucide/svelte/icons/file-text";
  import Folder from "@lucide/svelte/icons/folder";
  import Pin from "@lucide/svelte/icons/pin";
  import {
    Async,
    Card,
    EmptyState,
    ScreenHeader,
    SegmentedControl,
    Skeleton,
  } from "$lib/components/ui";
  import { listNotes, listWiki } from "$lib/api/content";
  import { remote } from "$lib/api/remote.svelte";
  import type { NoteListItem, WikiTreePage } from "$lib/api/types";
  import { relativeTime } from "$lib/utils/time";
  import { m } from "$lib/paraglide/messages";

  /* Notes — the staff knowledge tab: Wiki pages (indented tree), own quick
     notes (+ shared with me), and meeting notes. Rows open the read-only
     content views. */

  type Segment = "wiki" | "notes" | "meetings";
  let segment = $state<Segment>("wiki");

  const wiki = remote(
    () => ({}),
    (client) => listWiki(client),
  );
  const notes = remote(
    () => ({}),
    (client) => listNotes(client),
  );

  const segments = $derived([
    { value: "wiki", label: m.notes_seg_wiki() },
    { value: "notes", label: m.notes_seg_notes() },
    { value: "meetings", label: m.notes_seg_meetings() },
  ]);

  // Flatten the wiki tree into ordered rows with a depth for indentation.
  function flattenTree(pages: WikiTreePage[]): { page: WikiTreePage; depth: number }[] {
    const byParent = new Map<string | null, WikiTreePage[]>();
    for (const p of pages) {
      const list = byParent.get(p.parentId) ?? [];
      list.push(p);
      byParent.set(p.parentId, list);
    }
    const out: { page: WikiTreePage; depth: number }[] = [];
    const walk = (parentId: string | null, depth: number) => {
      for (const p of byParent.get(parentId) ?? []) {
        out.push({ page: p, depth });
        walk(p.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }
</script>

{#snippet noteRow(note: NoteListItem)}
  <a
    href={`/content/note/${note.id}`}
    class="flex h-12 items-center gap-3 px-4 text-[14px] transition-colors active:bg-(--color-bg-inset)"
  >
    <span class="w-5 shrink-0 text-center">{note.icon || "📝"}</span>
    <span class="min-w-0 flex-1 truncate text-(--color-text)">{note.title}</span>
    {#if note.pinned}
      <Pin size={13} class="shrink-0 text-(--color-text-light)" />
    {/if}
    <span class="shrink-0 font-mono text-[12px] text-(--color-text-light)">
      {note.meetingDate ?? relativeTime(note.updatedAt)}
    </span>
  </a>
{/snippet}

<main class="mx-auto max-w-lg px-4">
  <ScreenHeader title={m.notes_title()} />

  <SegmentedControl
    class="mt-4"
    options={segments}
    value={segment}
    onchange={(v) => (segment = v as Segment)}
  />

  <div class="mt-4 pb-6">
    {#if segment === "wiki"}
      <Async remote={wiki}>
        {#snippet skeleton()}
          <div class="space-y-3">
            <Skeleton class="h-12" />
            <Skeleton class="h-12" />
            <Skeleton class="h-12" />
          </div>
        {/snippet}
        {#snippet children(data)}
          {@const rows = flattenTree(data.pages)}
          {#if rows.length === 0}
            <EmptyState icon={FileText} title={m.notes_empty_title()} description={m.notes_empty_body()} />
          {:else}
            <Card padding="none" class="divide-y divide-(--color-border-subtle)">
              {#each rows as { page, depth } (page.id)}
                <a
                  href={page.isFolder ? undefined : `/content/wiki/${page.id}`}
                  class="flex h-12 items-center gap-3 px-4 text-[14px] transition-colors {page.isFolder
                    ? 'text-(--color-text-muted)'
                    : 'text-(--color-text) active:bg-(--color-bg-inset)'}"
                  style="padding-left: calc(1rem + {depth * 1.25}rem)"
                >
                  {#if page.icon}
                    <span class="w-5 shrink-0 text-center">{page.icon}</span>
                  {:else if page.isFolder}
                    <Folder size={15} strokeWidth={1.6} class="w-5 shrink-0 text-(--color-text-light)" />
                  {:else}
                    <FileText size={15} strokeWidth={1.6} class="w-5 shrink-0 text-(--color-text-light)" />
                  {/if}
                  <span class="min-w-0 flex-1 truncate">{page.title}</span>
                </a>
              {/each}
            </Card>
          {/if}
        {/snippet}
      </Async>
    {:else}
      <Async remote={notes}>
        {#snippet skeleton()}
          <div class="space-y-3">
            <Skeleton class="h-12" />
            <Skeleton class="h-12" />
            <Skeleton class="h-12" />
          </div>
        {/snippet}
        {#snippet children(data)}
          {#if segment === "meetings"}
            {#if data.meetings.length === 0}
              <EmptyState icon={FileText} title={m.notes_empty_title()} description={m.notes_empty_body()} />
            {:else}
              <Card padding="none" class="divide-y divide-(--color-border-subtle)">
                {#each data.meetings as note (note.id)}
                  {@render noteRow(note)}
                {/each}
              </Card>
            {/if}
          {:else if data.quick.length === 0 && data.shared.length === 0}
            <EmptyState icon={FileText} title={m.notes_empty_title()} description={m.notes_empty_body()} />
          {:else}
            {#if data.quick.length > 0}
              <Card padding="none" class="divide-y divide-(--color-border-subtle)">
                {#each data.quick as note (note.id)}
                  {@render noteRow(note)}
                {/each}
              </Card>
            {/if}
            {#if data.shared.length > 0}
              <p class="mt-5 mb-2 text-[12px] tracking-[0.08em] text-(--color-text-light) uppercase">
                {m.notes_shared()}
              </p>
              <Card padding="none" class="divide-y divide-(--color-border-subtle)">
                {#each data.shared as note (note.id)}
                  {@render noteRow(note)}
                {/each}
              </Card>
            {/if}
          {/if}
        {/snippet}
      </Async>
    {/if}
  </div>
</main>
