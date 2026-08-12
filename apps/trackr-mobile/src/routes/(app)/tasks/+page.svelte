<script lang="ts">
  import SquareCheck from "@lucide/svelte/icons/square-check-big";
  import Plus from "@lucide/svelte/icons/plus";
  import { Async, Card, EmptyState, ScreenHeader, Skeleton } from "$lib/components/ui";
  import { createTask, listMyTasks, setTaskStatus } from "$lib/api/tasks";
  import { remote } from "$lib/api/remote.svelte";
  import type { Task } from "$lib/api/types";
  import { session } from "$lib/session.svelte";
  import { toast } from "$lib/stores/toast.svelte";
  import { m } from "$lib/paraglide/messages";

  /* Tasks — sehen, abhaken, schnell anlegen. Checkbox = status 'done';
     quick-add posts a single title into the last-used project (stored
     locally). Structuring work stays on the desktop. */

  const tasks = remote(
    () => ({}),
    (client) => listMyTasks(client),
  );

  let quickTitle = $state("");
  let adding = $state(false);
  let lastProject = $state(localStorage.getItem("trackr:lastProjectKey") ?? "");

  const projectKeys = $derived(Object.keys(session.capabilities?.projects ?? {}));

  const open = $derived(
    (tasks.data?.tasks ?? []).filter((t) => t.status !== "done"),
  );
  const done = $derived(
    (tasks.data?.tasks ?? []).filter((t) => t.status === "done").slice(0, 10),
  );

  async function toggle(task: Task) {
    const client = session.client;
    if (!client) return;
    const next = task.status === "done" ? "todo" : "done";
    // Optimistic: flip locally, roll back on failure.
    const prev = task.status;
    task.status = next;
    try {
      await setTaskStatus(client, task.uuid, next);
    } catch (e) {
      task.status = prev;
      toast.error(e instanceof Error ? e.message : m.error_generic());
    }
  }

  async function quickAdd() {
    const client = session.client;
    const title = quickTitle.trim();
    if (!client || !title || adding) return;
    // Default project: last used, else the first membership. The web project
    // key is embedded in each task's display id, so any loaded task works too.
    const key =
      lastProject ||
      projectKeys[0] ||
      tasks.data?.tasks[0]?.project ||
      "";
    if (!key) {
      toast.error(m.error_generic());
      return;
    }
    adding = true;
    try {
      await createTask(client, { title, projectKey: key });
      localStorage.setItem("trackr:lastProjectKey", key);
      lastProject = key;
      quickTitle = "";
      await tasks.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : m.error_generic());
    } finally {
      adding = false;
    }
  }
</script>

{#snippet taskRow(task: Task)}
  <div class="flex min-h-14 items-center gap-3 px-4 py-3">
    <button
      type="button"
      class="grid h-6 w-6 shrink-0 place-items-center rounded-md border transition-colors {task.status === 'done'
        ? 'border-(--color-status-done) bg-(--color-status-done) text-white'
        : 'border-(--color-border-strong) bg-(--color-bg-subtle)'}"
      aria-label={task.title}
      onclick={() => void toggle(task)}
    >
      {#if task.status === "done"}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
      {/if}
    </button>
    <div class="min-w-0 flex-1">
      <p
        class="truncate text-sm font-medium {task.status === 'done'
          ? 'text-(--color-text-light) line-through'
          : 'text-(--color-text)'}"
      >
        {task.title}
      </p>
      <p class="truncate text-xs text-(--color-text-light)">
        {task.id}{task.due ? ` · ${task.due}` : ""}
      </p>
    </div>
  </div>
{/snippet}

<main class="mx-auto max-w-lg px-4">
  <ScreenHeader title={m.tasks_title()} accent />

  <!-- Quick add: one field, Enter creates. -->
  <div class="mt-4 flex items-center gap-2">
    <input
      bind:value={quickTitle}
      placeholder={m.tasks_add_placeholder()}
      enterkeyhint="done"
      onkeydown={(e) => {
        if (e.key === "Enter") void quickAdd();
      }}
      class="h-11 min-w-0 flex-1 rounded-xl border border-(--color-border) bg-(--color-bg-subtle) px-3.5 text-base text-(--color-text) placeholder:text-(--color-text-light) focus:border-(--color-accent) focus:ring-2 focus:ring-(--color-accent)/40"
    />
    <button
      type="button"
      class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-(--color-accent) text-(--color-accent-fg) disabled:opacity-50"
      disabled={adding || !quickTitle.trim()}
      aria-label={m.qc_create()}
      onclick={() => void quickAdd()}
    >
      <Plus size={20} strokeWidth={2.25} />
    </button>
  </div>

  <div class="mt-4 pb-6">
    <Async remote={tasks}>
      {#snippet skeleton()}
        <div class="space-y-3">
          <Skeleton class="h-14" />
          <Skeleton class="h-14" />
          <Skeleton class="h-14" />
        </div>
      {/snippet}
      {#snippet children(data)}
        {#if data.tasks.length === 0}
          <EmptyState
            icon={SquareCheck}
            title={m.tasks_empty_title()}
            description={m.tasks_empty_body()}
          />
        {:else}
          <Card padding="none" class="divide-y divide-(--color-border-subtle)">
            {#each open as task (task.uuid)}
              {@render taskRow(task)}
            {/each}
          </Card>
          {#if done.length > 0}
            <Card padding="none" class="mt-3 divide-y divide-(--color-border-subtle) opacity-70">
              {#each done as task (task.uuid)}
                {@render taskRow(task)}
              {/each}
            </Card>
          {/if}
        {/if}
      {/snippet}
    </Async>
  </div>
</main>
