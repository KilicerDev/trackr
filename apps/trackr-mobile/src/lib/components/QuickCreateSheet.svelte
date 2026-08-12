<script lang="ts">
  import { BottomSheet, Button, SegmentedControl, TextField } from "$lib/components/ui";
  import { createTicket } from "$lib/api/tickets";
  import { createTask } from "$lib/api/tasks";
  import { createNote } from "$lib/api/content";
  import { session } from "$lib/session.svelte";
  import { toast } from "$lib/stores/toast.svelte";
  import { m } from "$lib/paraglide/messages";

  /* The global + sheet: one field, three targets (filtered by the capability
     manifest). Everything else is "am Desktop nachpflegen". */

  type Kind = "ticket" | "task" | "note";

  let {
    open = $bindable(false),
    kind = $bindable("ticket"),
  }: { open?: boolean; kind?: Kind } = $props();

  let title = $state("");
  let orgId = $state("");
  let projectKey = $state("");
  let saving = $state(false);

  const caps = $derived(session.capabilities);
  const options = $derived.by(() => {
    const list: { value: Kind; label: string }[] = [];
    if (caps?.quickCreate.ticket) list.push({ value: "ticket", label: m.qc_ticket() });
    if (caps?.quickCreate.task) list.push({ value: "task", label: m.qc_task() });
    if (caps?.quickCreate.note) list.push({ value: "note", label: m.qc_note() });
    return list;
  });
  const orgs = $derived(session.me?.orgs ?? []);
  const projectKeys = $derived(Object.keys(caps?.projects ?? {}));

  // Keep the selected kind valid for the current capability set.
  $effect(() => {
    if (options.length && !options.some((o) => o.value === kind)) {
      kind = options[0].value;
    }
  });
  $effect(() => {
    if (!orgId && orgs.length) orgId = orgs[0].id;
  });

  const placeholder = $derived(
    kind === "ticket"
      ? m.qc_ticket_placeholder()
      : kind === "task"
        ? m.qc_task_placeholder()
        : m.qc_note_placeholder(),
  );

  async function create() {
    const client = session.client;
    const value = title.trim();
    if (!client || !value || saving) return;
    saving = true;
    try {
      if (kind === "ticket") {
        await createTicket(client, { orgId, subject: value });
      } else if (kind === "task") {
        // Staff without a stored last-used project fall back to the first
        // membership; staff see all projects server-side, so a typed key
        // wins when provided.
        const key = projectKey.trim().toUpperCase() || projectKeys[0] || "";
        await createTask(client, { title: value, projectKey: key });
      } else {
        await createNote(client, { title: value });
      }
      toast.success(m.qc_created());
      title = "";
      open = false;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : m.error_generic());
    } finally {
      saving = false;
    }
  }
</script>

<BottomSheet bind:open title={m.qc_title()} dismissible={false}>
  {#if options.length > 1}
    <SegmentedControl
      {options}
      bind:value={kind}
      class="mb-4"
    />
  {/if}

  <TextField
    bind:value={title}
    placeholder={placeholder}
    enterkeyhint="done"
    onkeydown={(e: KeyboardEvent) => {
      if (e.key === "Enter") void create();
    }}
  />

  {#if kind === "ticket" && orgs.length > 1}
    <label class="mt-4 block">
      <span class="mb-1.5 block text-sm font-medium text-(--color-text)">{m.qc_org_label()}</span>
      <select
        bind:value={orgId}
        class="h-12 w-full rounded-lg border border-(--color-border) bg-(--color-bg-subtle) px-3 text-base text-(--color-text)"
      >
        {#each orgs as org (org.id)}
          <option value={org.id}>{org.name}</option>
        {/each}
      </select>
    </label>
  {/if}

  {#if kind === "task"}
    <TextField
      class="mt-4"
      label={m.qc_project_label()}
      bind:value={projectKey}
      placeholder={projectKeys[0] ?? "TRACKR"}
      autocapitalize="characters"
      autocorrect="off"
      spellcheck={false}
    />
  {/if}

  <p class="mt-3 text-xs text-(--color-text-light)">{m.qc_hint()}</p>

  {#snippet footer()}
    <div class="flex gap-2">
      <Button variant="outline" class="flex-1" onclick={() => (open = false)}>
        {m.common_cancel()}
      </Button>
      <Button class="flex-1" disabled={saving || !title.trim()} onclick={create}>
        {m.qc_create()}
      </Button>
    </div>
  {/snippet}
</BottomSheet>
