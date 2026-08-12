<script lang="ts">
  import { page } from "$app/state";
  import { Async, ScreenHeader, Skeleton } from "$lib/components/ui";
  import { getWikiPage } from "$lib/api/content";
  import { remote } from "$lib/api/remote.svelte";
  import { fullTime } from "$lib/utils/time";

  /* Read-only wiki page (body_html read model). Editing is desktop-only. */

  const wiki = remote(
    () => page.params.id!,
    (client, id) => getWikiPage(client, id),
  );
</script>

<main class="mx-auto max-w-lg px-4 pb-8">
  <Async remote={wiki}>
    {#snippet skeleton()}
      <div class="space-y-3 pt-16">
        <Skeleton class="h-10" />
        <Skeleton class="h-48" />
      </div>
    {/snippet}
    {#snippet children(data)}
      <ScreenHeader title={data.page.title} back="/search" />
      <p class="mt-1 text-xs text-(--color-text-light)">{fullTime(data.page.updatedAt)}</p>
      <article class="prose-mobile mt-5">
        <!-- eslint-disable-next-line svelte/no-at-html-tags — server-rendered read model -->
        {@html data.page.bodyHtml}
      </article>
    {/snippet}
  </Async>
</main>

<style>
  /* Minimal typography for the rendered document HTML. */
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
  .prose-mobile :global(code) {
    font-family: var(--font-mono);
    font-size: 0.85em;
    background: var(--color-bg-inset);
    border-radius: 4px;
    padding: 0.1em 0.35em;
  }
  .prose-mobile :global(pre) {
    overflow-x: auto;
    background: var(--color-bg-inset);
    border-radius: 8px;
    padding: 0.75rem;
  }
  .prose-mobile :global(img) {
    max-width: 100%;
    border-radius: 8px;
  }
  .prose-mobile :global(blockquote) {
    border-left: 3px solid var(--color-border-strong);
    margin: 0.6em 0;
    padding-left: 0.9rem;
    color: var(--color-text-light);
  }
</style>
