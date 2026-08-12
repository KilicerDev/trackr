<script lang="ts">
  import SquareCheck from "@lucide/svelte/icons/square-check-big";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import { Async, Card, EmptyState, PriorityBars, ScreenHeader, Skeleton, StatusDot } from "$lib/components/ui";
  import { listMyTasks } from "$lib/api/tasks";
  import { remote } from "$lib/api/remote.svelte";
  import type { Task } from "$lib/api/types";
  import { TASK_STATUSES, taskStatusLabel } from "$lib/utils/tasks";
  import { persistTaskFilters, taskFilters } from "$lib/stores/task-filters.svelte";
  import { ticketPriorityMeta } from "$lib/utils/tickets";
  import { m } from "$lib/paraglide/messages";

  /* Tasks — a plain list (web list-view anatomy: status glyph, title, mono
     id · due, priority bars) grouped per project; rows open the detail page
     where all editing lives. Filter chips (project / status / priority) use
     native pickers; creation goes through the + FAB. */

  const TASK_PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;

  const tasks = remote(
    () => ({}),
    (client) => listMyTasks(client),
  );

  /* Multi-select filters — empty array = no filter. Held in a persistent
     module store (survives detail-page round-trips and app restarts).
     Native multi pickers commit on blur (picker dismissed) like the
     assignee editors, so the list never re-renders under an open picker. */
  function commitFilter(
    select: HTMLSelectElement,
    key: "projects" | "statuses" | "priorities" | "assignees",
  ) {
    taskFilters[key] = Array.from(select.selectedOptions, (o) => o.value);
    persistTaskFilters();
  }

  const projectOptions = $derived(
    [...new Set((tasks.data?.tasks ?? []).map((t) => t.project))].sort(),
  );
  const assigneeOptions = $derived.by(() => {
    const users = tasks.data?.users ?? {};
    const ids = new Set((tasks.data?.tasks ?? []).flatMap((t) => t.assignees ?? []));
    return [...ids]
      .map((id) => ({ id, name: users[id]?.name ?? "—" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  const filtered = $derived(
    (tasks.data?.tasks ?? []).filter(
      (t) =>
        (!taskFilters.projects.length || taskFilters.projects.includes(t.project)) &&
        (!taskFilters.statuses.length || taskFilters.statuses.includes(t.status)) &&
        (!taskFilters.priorities.length || taskFilters.priorities.includes(t.priority)) &&
        (!taskFilters.assignees.length ||
          (t.assignees ?? []).some((id) => taskFilters.assignees.includes(id))),
    ),
  );

  const open = $derived(filtered.filter((t) => t.status !== "done"));
  const done = $derived(
    taskFilters.statuses.length && !taskFilters.statuses.includes("done")
      ? []
      : filtered.filter((t) => t.status === "done").slice(0, 10),
  );

  /** Chip label: generic when unset, value when one, "value +n" when more. */
  function chipLabel(values: string[], fallback: string, labelOf: (v: string) => string): string {
    if (!values.length) return fallback;
    const first = labelOf(values[0]);
    return values.length === 1 ? first : `${first} +${values.length - 1}`;
  }

  // Open tasks grouped per project (web list view's grouping), keys sorted.
  const openByProject = $derived.by(() => {
    const groups = new Map<string, Task[]>();
    for (const t of open) {
      const list = groups.get(t.project) ?? [];
      list.push(t);
      groups.set(t.project, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  });

</script>

{#snippet filterChip(active: boolean, label: string)}
  <span
    class="inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[13px] {active
      ? 'border-(--color-accent)/40 bg-(--color-accent-soft) text-(--color-text)'
      : 'border-(--color-border) bg-(--color-bg-subtle) text-(--color-text-muted)'}"
  >
    {label}
    <ChevronDown size={13} class="text-(--color-text-light)" />
  </span>
{/snippet}

{#snippet taskRow(task: Task)}
  {@const prio = ticketPriorityMeta(task.priority)}
  <a
    href={`/tasks/${task.uuid}`}
    class="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors active:bg-(--color-bg-inset)"
  >
    <StatusDot status={task.status} size={15} />
    <span class="min-w-0 flex-1">
      <span
        class="block truncate text-sm font-medium {task.status === 'done'
          ? 'text-(--color-text-light)'
          : 'text-(--color-text)'}"
      >
        {task.title}
      </span>
      <span class="block truncate font-mono text-[12px] text-(--color-text-light)">
        {task.id}{task.due ? ` · ${task.due}` : ""}
      </span>
    </span>
    <PriorityBars color={prio.color} level={prio.level} />
  </a>
{/snippet}

<main class="mx-auto max-w-lg px-4">
  <ScreenHeader title={m.tasks_title()} />

  <!-- Filter chips — each carries an invisible native multi-select that
       commits on blur. -->
  <div class="mt-4 flex gap-2 overflow-x-auto">
    <label class="relative shrink-0">
      {@render filterChip(
        taskFilters.projects.length > 0,
        chipLabel(taskFilters.projects, m.task_meta_project(), (v) => v),
      )}
      <select
        multiple
        class="absolute inset-0 h-full w-full appearance-none opacity-0"
        onblur={(e) => commitFilter(e.currentTarget, "projects")}
      >
        {#each projectOptions as key (key)}
          <option value={key} selected={taskFilters.projects.includes(key)}>{key}</option>
        {/each}
      </select>
    </label>
    <label class="relative shrink-0">
      {@render filterChip(
        taskFilters.statuses.length > 0,
        chipLabel(taskFilters.statuses, m.ticket_change_status(), taskStatusLabel),
      )}
      <select
        multiple
        class="absolute inset-0 h-full w-full appearance-none opacity-0"
        onblur={(e) => commitFilter(e.currentTarget, "statuses")}
      >
        {#each TASK_STATUSES as status (status)}
          <option value={status} selected={taskFilters.statuses.includes(status)}>
            {taskStatusLabel(status)}
          </option>
        {/each}
      </select>
    </label>
    <label class="relative shrink-0">
      {@render filterChip(
        taskFilters.priorities.length > 0,
        chipLabel(taskFilters.priorities, m.task_meta_priority(), (v) => ticketPriorityMeta(v).label),
      )}
      <select
        multiple
        class="absolute inset-0 h-full w-full appearance-none opacity-0"
        onblur={(e) => commitFilter(e.currentTarget, "priorities")}
      >
        {#each TASK_PRIORITIES as priority (priority)}
          <option value={priority} selected={taskFilters.priorities.includes(priority)}>
            {ticketPriorityMeta(priority).label}
          </option>
        {/each}
      </select>
    </label>
    <label class="relative shrink-0">
      {@render filterChip(
        taskFilters.assignees.length > 0,
        chipLabel(
          taskFilters.assignees,
          m.task_meta_assignees(),
          (v) => tasks.data?.users[v]?.name ?? "—",
        ),
      )}
      <select
        multiple
        class="absolute inset-0 h-full w-full appearance-none opacity-0"
        onblur={(e) => commitFilter(e.currentTarget, "assignees")}
      >
        {#each assigneeOptions as candidate (candidate.id)}
          <option value={candidate.id} selected={taskFilters.assignees.includes(candidate.id)}>
            {candidate.name}
          </option>
        {/each}
      </select>
    </label>
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
          {#each openByProject as [projectKey, group], i (projectKey)}
            <p class="{i === 0 ? '' : 'mt-5'} mb-2 flex items-baseline gap-1.5 px-1">
              <span class="text-[12px] font-medium tracking-[0.08em] text-(--color-text-light) uppercase">
                {projectKey}
              </span>
              <span class="font-mono text-[12px] text-(--color-text-light)">{group.length}</span>
            </p>
            <Card padding="none" class="divide-y divide-(--color-border-subtle)">
              {#each group as task (task.uuid)}
                {@render taskRow(task)}
              {/each}
            </Card>
          {/each}
          {#if done.length > 0}
            <p class="mt-5 mb-2 flex items-baseline gap-1.5 px-1">
              <span class="text-[12px] font-medium tracking-[0.08em] text-(--color-text-light) uppercase">
                {m.task_status_done()}
              </span>
              <span class="font-mono text-[12px] text-(--color-text-light)">{done.length}</span>
            </p>
            <Card padding="none" class="divide-y divide-(--color-border-subtle) opacity-70">
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
