<script lang="ts">
  import { page } from "$app/state";
  import { Async, ScreenHeader, Skeleton } from "$lib/components/ui";
  import { getNote } from "$lib/api/content";
  import { remote } from "$lib/api/remote.svelte";
  import { fullTime } from "$lib/utils/time";

  /* Read-only note (body_html read model). Editing is desktop-only. */

  const note = remote(
    () => page.params.id!,
    (client, id) => getNote(client, id),
  );
</script>

<main class="mx-auto max-w-lg px-4 pb-8">
  <Async remote={note}>
    {#snippet skeleton()}
      <div class="space-y-3 pt-16">
        <Skeleton class="h-10" />
        <Skeleton class="h-48" />
      </div>
    {/snippet}
    {#snippet children(data)}
      <ScreenHeader title={data.note.title || "—"} back="/search" />
      <p class="mt-1 text-xs text-(--color-text-light)">
        {data.note.meetingDate
          ? fullTime(data.note.meetingDate)
          : fullTime(data.note.updatedAt)}
      </p>
      <article class="prose-mobile mt-5">
        <!-- eslint-disable-next-line svelte/no-at-html-tags — server-rendered read model -->
        {@html data.note.bodyHtml}
      </article>
    {/snippet}
  </Async>
</main>

<style>
  .prose-mobile :global(:is(h1, h2, h3)) {
    margin: 1.2em 0 0.4em;
    font-weight: 600;
    color: var(--color-text);
  }
  .prose-mobile :global(:is(p, ul, ol)) {
    margin: 0.6em 0;
    font-size: 0.925rem;
    line-height: 1.65;
    color: var(--color-text-muted);
  }
  .prose-mobile :global(:is(ul, ol)) {
    padding-left: 1.25rem;
  }
  .prose-mobile :global(a) {
    color: var(--color-accent-strong);
  }
</style>
