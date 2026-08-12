<script lang="ts">
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import MessageCircle from "@lucide/svelte/icons/message-circle";
  import Plus from "@lucide/svelte/icons/plus";
  import { page } from "$app/state";
  import {
    Async,
    Avatar,
    BottomSheet,
    Button,
    Card,
    DateField,
    PriorityBars,
    ScreenHeader,
    Skeleton,
    StatusDot,
    TextField,
  } from "$lib/components/ui";
  import { addTaskTimeLog, getTask, updateTask } from "$lib/api/tasks";
  import type { TaskChecklistItem } from "$lib/api/types";
  import { remote } from "$lib/api/remote.svelte";
  import { session } from "$lib/session.svelte";
  import { TASK_STATUSES, taskStatusLabel, taskTypeLabel } from "$lib/utils/tasks";
  import { ticketPriorityMeta } from "$lib/utils/tickets";
  import { toast } from "$lib/stores/toast.svelte";
  import { m } from "$lib/paraglide/messages";

  /* Task detail — the web Inspector's property panel as a page. For editors
     (canEdit) status/type/priority use native pickers, due the native date
     picker, assignees the native multi-select; checklist and description
     edit inline. Comments live on their own page behind the chat button. */

  const TASK_TYPES = ["task", "bug", "improvement", "feature", "chore"] as const;
  const TASK_PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;
  const TAG_PALETTE = ["#7fc8a9", "#7a9cf0", "#ef7a6d", "#c08bd6", "#e9c46a", "#8fb6c4"];

  const taskId = $derived(page.params.id!);

  const detail = remote(
    () => taskId,
    (client, id) => getTask(client, id),
  );

  let saving = $state(false);
  let descDraft = $state("");
  let checklistDraft = $state("");

  /* Log-time sheet — mirrors the web timeLogAdd action: hours + minutes +
     date + optional note; anyone who can see the task may log. */
  let timeSheetOpen = $state(false);
  let logHours = $state("");
  let logMinutes = $state("");
  let logDate = $state(new Date().toISOString().slice(0, 10));
  let logNote = $state("");
  let logging = $state(false);

  const logTotal = $derived(
    Math.round(Number(logHours || 0) * 60) + Math.round(Number(logMinutes || 0)),
  );

  async function logTime() {
    const client = session.client;
    if (!client || logging || logTotal <= 0 || !logDate) return;
    logging = true;
    try {
      await addTaskTimeLog(client, taskId, {
        minutes: logTotal,
        date: logDate,
        note: logNote.trim() || undefined,
      });
      logHours = "";
      logMinutes = "";
      logNote = "";
      timeSheetOpen = false;
      await detail.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : m.error_generic());
    } finally {
      logging = false;
    }
  }

  // Seed the description draft whenever fresh data lands (patch refreshes
  // re-seed with the saved value).
  $effect(() => {
    const d = detail.data;
    if (d) descDraft = d.task.description ?? "";
  });

  const descDirty = $derived(
    detail.data ? descDraft !== (detail.data.task.description ?? "") : false,
  );

  async function applyPatch(patch: Parameters<typeof updateTask>[2]) {
    const client = session.client;
    if (!client || saving) return;
    saving = true;
    try {
      await updateTask(client, taskId, patch);
      await detail.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : m.error_generic());
    } finally {
      saving = false;
    }
  }

  function commitAssignees(select: HTMLSelectElement) {
    const current = detail.data?.task.assignees ?? [];
    const next = Array.from(select.selectedOptions, (o) => o.value);
    const same =
      next.length === current.length && next.every((id) => current.includes(id));
    if (!same) void applyPatch({ assigneeIds: next });
  }

  function toggleChecklistItem(index: number) {
    const items = detail.data?.task.checklist ?? [];
    void applyPatch({
      checklist: items.map((it, i) => (i === index ? { ...it, done: !it.done } : it)),
    });
  }

  function addChecklistItem() {
    const text = checklistDraft.trim();
    const items = detail.data?.task.checklist ?? [];
    if (!text) return;
    checklistDraft = "";
    void applyPatch({ checklist: [...items, { text, done: false }] });
  }

  function author(id: string | null | undefined): { name: string; color: string } | null {
    if (!id) return null;
    return detail.data?.authors[id] ?? null;
  }

  function fmtMinutes(mins: number): string {
    const h = Math.floor(mins / 60);
    const mm = mins % 60;
    if (h && mm) return m.estimate_h_m({ h, m: mm });
    if (h) return m.estimate_h({ h });
    return m.estimate_m({ m: mm });
  }

  function tagColor(tag: string): string {
    let h = 0;
    for (const ch of tag) h = (h * 31 + ch.charCodeAt(0)) % TAG_PALETTE.length;
    return TAG_PALETTE[h];
  }
</script>

{#snippet rowLabel(text: string)}
  <span class="w-24 shrink-0 text-[12px] tracking-[0.08em] text-(--color-text-light) uppercase">
    {text}
  </span>
{/snippet}

<main class="mx-auto max-w-lg px-4 pb-6">
  <Async remote={detail}>
    {#snippet skeleton()}
      <div class="space-y-3 pt-16">
        <Skeleton class="h-20" />
        <Skeleton class="h-40" />
      </div>
    {/snippet}
    {#snippet children(data)}
      {@const t = data.task}
      {@const prio = ticketPriorityMeta(t.priority)}
      {@const loggedTotal = (t.timeLogs ?? []).reduce((sum, l) => sum + l.minutes, 0)}
      <ScreenHeader title={t.title} back="/tasks">
        {#snippet trailing()}
          <a
            href={`/tasks/${t.uuid}/comments`}
            class="relative grid h-10 w-10 place-items-center rounded-full border border-(--color-border) bg-(--color-bg-subtle) text-(--color-text-muted) active:bg-(--color-bg-inset)"
            aria-label={m.task_comments()}
          >
            <MessageCircle size={18} strokeWidth={1.6} />
            {#if t.comments?.length}
              <span
                class="absolute -top-1 -right-1 min-w-4 rounded-full bg-(--color-accent) px-1 text-center font-mono text-[9px] leading-4 font-semibold text-(--color-accent-fg)"
              >
                {t.comments.length}
              </span>
            {/if}
          </a>
        {/snippet}
      </ScreenHeader>

      <p class="mt-1.5 flex items-center gap-2 text-[12px] text-(--color-text-muted)">
        <span class="font-mono text-(--color-text-light)">{t.id}</span>
        <span>{t.project}</span>
      </p>

      <!-- Property panel (web Inspector rows). Native pickers sit invisibly
           over the editable rows. -->
      <Card padding="none" class="mt-4 divide-y divide-(--color-border-subtle)">
        <label class="relative flex h-12 items-center gap-3 px-4 text-[14px]">
          {@render rowLabel(m.ticket_change_status())}
          <StatusDot status={t.status} />
          <span class="min-w-0 flex-1 truncate text-(--color-text)">{taskStatusLabel(t.status)}</span>
          {#if data.canEdit}
            <ChevronDown size={15} class="shrink-0 text-(--color-text-light)" />
            <select
              class="absolute inset-0 h-full w-full appearance-none opacity-0"
              value={t.status}
              disabled={saving}
              onchange={(e) => void applyPatch({ status: e.currentTarget.value })}
            >
              {#each TASK_STATUSES as status (status)}
                <option value={status}>{taskStatusLabel(status)}</option>
              {/each}
            </select>
          {/if}
        </label>

        <div class="flex h-12 items-center gap-3 px-4 text-[14px]">
          {@render rowLabel(m.task_meta_project())}
          <span class="min-w-0 flex-1 truncate font-mono text-[13px] text-(--color-text)">{t.project}</span>
        </div>

        <label class="relative flex h-12 items-center gap-3 px-4 text-[14px]">
          {@render rowLabel(m.task_meta_type())}
          <span class="min-w-0 flex-1 truncate text-(--color-text)">{taskTypeLabel(t.type)}</span>
          {#if data.canEdit}
            <ChevronDown size={15} class="shrink-0 text-(--color-text-light)" />
            <select
              class="absolute inset-0 h-full w-full appearance-none opacity-0"
              value={t.type}
              disabled={saving}
              onchange={(e) => void applyPatch({ type: e.currentTarget.value })}
            >
              {#each TASK_TYPES as type (type)}
                <option value={type}>{taskTypeLabel(type)}</option>
              {/each}
            </select>
          {/if}
        </label>

        <label class="relative flex h-12 items-center gap-3 px-4 text-[14px]">
          {@render rowLabel(m.task_meta_priority())}
          <PriorityBars color={prio.color} level={prio.level} />
          <span class="min-w-0 flex-1 truncate text-(--color-text)">{prio.label}</span>
          {#if data.canEdit}
            <ChevronDown size={15} class="shrink-0 text-(--color-text-light)" />
            <select
              class="absolute inset-0 h-full w-full appearance-none opacity-0"
              value={t.priority}
              disabled={saving}
              onchange={(e) => void applyPatch({ priority: e.currentTarget.value })}
            >
              {#each TASK_PRIORITIES as priority (priority)}
                <option value={priority}>{ticketPriorityMeta(priority).label}</option>
              {/each}
            </select>
          {/if}
        </label>

        <label class="relative flex h-12 items-center gap-3 px-4 text-[14px]">
          {@render rowLabel(m.task_meta_due())}
          <span
            class="min-w-0 flex-1 truncate font-mono text-[13px] {t.due
              ? 'text-(--color-text)'
              : 'text-(--color-text-light)'}"
          >
            {t.due ?? "—"}
          </span>
          {#if data.canEdit}
            <ChevronDown size={15} class="shrink-0 text-(--color-text-light)" />
            <input
              type="date"
              class="absolute inset-0 h-full w-full opacity-0"
              value={t.due ?? ""}
              disabled={saving}
              onchange={(e) => void applyPatch({ due: e.currentTarget.value || null })}
            />
          {/if}
        </label>

        {#if t.estimate}
          <div class="flex h-12 items-center gap-3 px-4 text-[14px]">
            {@render rowLabel(m.task_meta_estimate())}
            <span class="min-w-0 flex-1 truncate font-mono text-[13px] text-(--color-text)">
              {fmtMinutes(t.estimate)}
            </span>
          </div>
        {/if}

        <!-- Anyone who can see the task may log time (web timeLogAdd rule). -->
        <button
          type="button"
          class="flex h-12 w-full items-center gap-3 px-4 text-left text-[14px] transition-colors active:bg-(--color-bg-inset)"
          onclick={() => (timeSheetOpen = true)}
        >
          {@render rowLabel(m.task_meta_logged())}
          <span
            class="min-w-0 flex-1 truncate font-mono text-[13px] {loggedTotal > 0
              ? 'text-(--color-text)'
              : 'text-(--color-text-light)'}"
          >
            {loggedTotal > 0 ? fmtMinutes(loggedTotal) : "—"}
          </span>
          <Plus size={15} class="shrink-0 text-(--color-text-light)" />
        </button>

        <label class="relative flex min-h-12 items-center gap-3 px-4 py-2 text-[14px]">
          {@render rowLabel(m.task_meta_assignees())}
          <span class="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
            {#if t.assignees?.length}
              {#each t.assignees as id (id)}
                {@const who = author(id)}
                {#if who}
                  <span class="inline-flex items-center gap-1.5 text-(--color-text)">
                    <Avatar name={who.name} color={who.color} size={20} />
                    {who.name}
                  </span>
                {/if}
              {/each}
            {:else}
              <span class="text-(--color-text-light)">{m.ticket_unassigned()}</span>
            {/if}
          </span>
          {#if data.canEdit}
            <ChevronDown size={15} class="shrink-0 text-(--color-text-light)" />
            <select
              multiple
              class="absolute inset-0 h-full w-full appearance-none opacity-0"
              disabled={saving}
              onblur={(e) => commitAssignees(e.currentTarget)}
            >
              {#each data.assignableUsers as candidate (candidate.id)}
                <option value={candidate.id} selected={t.assignees?.includes(candidate.id)}>
                  {candidate.name}
                </option>
              {/each}
            </select>
          {/if}
        </label>

        {#if t.tags?.length}
          <div class="flex min-h-12 items-center gap-3 px-4 py-2 text-[14px]">
            {@render rowLabel(m.task_meta_tags())}
            <span class="flex min-w-0 flex-1 flex-wrap gap-1.5">
              {#each t.tags as tag (tag)}
                <span
                  class="inline-flex items-center rounded-[5px] px-[7px] py-[2px] font-mono text-[12px] font-medium"
                  style="color: {tagColor(tag)}; background: {tagColor(tag)}24"
                >
                  {tag}
                </span>
              {/each}
            </span>
          </div>
        {/if}
      </Card>

      {#if t.description || data.canEdit}
        <p class="mt-6 mb-2 text-[12px] tracking-[0.08em] text-(--color-text-light) uppercase">
          {m.task_description()}
        </p>
        {#if data.canEdit}
          <textarea
            bind:value={descDraft}
            rows="3"
            class="min-h-24 w-full resize-none rounded-xl border border-(--color-border) bg-(--color-bg-subtle) px-3.5 py-2.5 text-base leading-relaxed text-(--color-text) placeholder:text-(--color-text-light) focus:border-(--color-border-strong) focus:outline-none"
            placeholder="…"
          ></textarea>
          {#if descDirty}
            <button
              type="button"
              class="mt-2 inline-flex h-9 items-center rounded-lg bg-(--color-accent) px-3.5 text-[14px] font-medium text-(--color-accent-fg) disabled:opacity-50"
              disabled={saving}
              onclick={() => void applyPatch({ description: descDraft })}
            >
              {m.common_save()}
            </button>
          {/if}
        {:else}
          <p class="text-[14px] leading-relaxed break-words [overflow-wrap:anywhere] whitespace-pre-wrap text-(--color-text)">
            {t.description}
          </p>
        {/if}
      {/if}

      {#if t.checklist?.length || data.canEdit}
        <p class="mt-6 mb-2 text-[12px] tracking-[0.08em] text-(--color-text-light) uppercase">
          {m.task_checklist()}
          {#if t.checklist?.length}
            <span class="ml-1.5 font-mono normal-case">
              {t.checklist.filter((c: TaskChecklistItem) => c.done).length}/{t.checklist.length}
            </span>
          {/if}
        </p>
        <Card padding="none" class="divide-y divide-(--color-border-subtle)">
          {#each t.checklist ?? [] as item, i (item.id)}
            <svelte:element
              this={data.canEdit ? "button" : "div"}
              {...data.canEdit ? { type: "button", onclick: () => toggleChecklistItem(i), disabled: saving } : {}}
              class="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left text-[14px] {data.canEdit
                ? 'transition-colors active:bg-(--color-bg-inset) disabled:opacity-60'
                : ''}"
            >
              <span
                class="grid h-4 w-4 shrink-0 place-items-center rounded border {item.done
                  ? 'border-(--color-status-done) bg-(--color-status-done) text-white'
                  : 'border-(--color-border-strong)'}"
              >
                {#if item.done}
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                {/if}
              </span>
              <span class={item.done ? "text-(--color-text-light) line-through" : "text-(--color-text)"}>
                {item.text}
              </span>
            </svelte:element>
          {/each}
          {#if data.canEdit}
            <div class="flex min-h-11 items-center gap-3 px-4 py-1.5">
              <Plus size={14} strokeWidth={1.6} class="shrink-0 text-(--color-text-light)" />
              <input
                bind:value={checklistDraft}
                placeholder={m.task_checklist_add()}
                enterkeyhint="done"
                onkeydown={(e) => {
                  if (e.key === "Enter") addChecklistItem();
                }}
                class="h-8 min-w-0 flex-1 border-0 bg-transparent text-base text-(--color-text) placeholder:text-(--color-text-light) focus:outline-none"
              />
            </div>
          {/if}
        </Card>
      {/if}

      <BottomSheet bind:open={timeSheetOpen} title={m.task_log_time()}>
        <div class="space-y-4 px-5 pt-2 pb-4">
          <div class="flex gap-3">
            <TextField
              label={m.task_log_hours()}
              bind:value={logHours}
              type="number"
              inputmode="numeric"
              min="0"
              placeholder="0"
              class="flex-1"
            />
            <TextField
              label={m.task_log_minutes()}
              bind:value={logMinutes}
              type="number"
              inputmode="numeric"
              min="0"
              placeholder="0"
              class="flex-1"
            />
          </div>
          <DateField label={m.task_log_date()} bind:value={logDate} required />
          <TextField label={m.task_log_note()} bind:value={logNote} />
          <Button
            size="lg"
            class="w-full"
            disabled={logging || logTotal <= 0 || !logDate}
            onclick={() => void logTime()}
          >
            {m.task_log_time()}
          </Button>

          {#if t.timeLogs?.length}
            <div class="divide-y divide-(--color-border-subtle) border-t border-(--color-border-subtle)">
              {#each [...t.timeLogs].reverse().slice(0, 5) as log, i (i)}
                {@const who = author(log.user)}
                <div class="flex items-center gap-3 py-2.5 text-[13px]">
                  {#if who}
                    <Avatar name={who.name} color={who.color} size={20} />
                  {/if}
                  <span class="min-w-0 flex-1 truncate text-(--color-text-muted)">
                    {who?.name ?? "—"}{log.note ? ` · ${log.note}` : ""}
                  </span>
                  <span class="shrink-0 font-mono text-[12px] text-(--color-text-light)">
                    {log.date} · {fmtMinutes(log.minutes)}
                  </span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </BottomSheet>
    {/snippet}
  </Async>
</main>
