<script lang="ts">
  import { page } from "$app/state";
  import { Async, Card, ScreenHeader, Skeleton, StatusBadge } from "$lib/components/ui";
  import { getProject } from "$lib/api/content";
  import { remote } from "$lib/api/remote.svelte";
  import { fullTime } from "$lib/utils/time";
  import { m } from "$lib/paraglide/messages";

  /* Read-only project summary — reachable via search. Project structuring
     is a desktop concern. */

  const project = remote(
    () => page.params.id!,
    (client, id) => getProject(client, id),
  );
</script>

<main class="mx-auto max-w-lg px-4 pb-8">
  <Async remote={project}>
    {#snippet skeleton()}
      <div class="space-y-3 pt-16">
        <Skeleton class="h-10" />
        <Skeleton class="h-32" />
      </div>
    {/snippet}
    {#snippet children(data)}
      <ScreenHeader title={data.project.name} eyebrow={data.project.key} back="/">
        {#snippet trailing()}
          <StatusBadge tone={data.project.status === "active" ? "success" : "neutral"}>
            {data.project.status}
          </StatusBadge>
        {/snippet}
      </ScreenHeader>

      <Card class="mt-5">
        {#if data.project.description}
          <p class="text-sm whitespace-pre-wrap text-(--color-text-muted)">
            {data.project.description}
          </p>
        {/if}
        <dl class="mt-3 space-y-1.5 text-sm">
          {#if data.project.orgName}
            <div class="flex justify-between">
              <dt class="text-(--color-text-light)">{m.qc_org_label()}</dt>
              <dd class="text-(--color-text)">{data.project.orgName}</dd>
            </div>
          {/if}
          <div class="flex justify-between">
            <dt class="text-(--color-text-light)">{m.tab_tasks()}</dt>
            <dd class="text-(--color-text)">{data.project.taskCount}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-(--color-text-light)">·</dt>
            <dd class="text-(--color-text-light)">{fullTime(data.project.updatedAt)}</dd>
          </div>
        </dl>
      </Card>
    {/snippet}
  </Async>
</main>
