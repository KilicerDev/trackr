<script lang="ts">
  import Send from "@lucide/svelte/icons/send";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import MessagesSquare from "@lucide/svelte/icons/messages-square";
  import { tick } from "svelte";
  import { page } from "$app/state";
  import { Async, Avatar, EmptyState, ScreenHeader, Skeleton } from "$lib/components/ui";
  import { addTaskComment, getTask } from "$lib/api/tasks";
  import { remote } from "$lib/api/remote.svelte";
  import { session } from "$lib/session.svelte";
  import { fullTime } from "$lib/utils/time";
  import { toast } from "$lib/stores/toast.svelte";
  import { m } from "$lib/paraglide/messages";

  /* Task comments — the conversation split out of the detail page, with the
     same row anatomy and composer as chat threads. */

  const taskId = $derived(page.params.id!);

  const detail = remote(
    () => taskId,
    (client, id) => getTask(client, id),
  );

  let body = $state("");
  let sending = $state(false);
  let scrolledFor = $state<string | null>(null);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
  }

  $effect(() => {
    const id = taskId;
    if (!detail.data || scrolledFor === id) return;
    scrolledFor = id;
    void tick().then(scrollToBottom);
  });

  async function send() {
    const client = session.client;
    const text = body.trim();
    if (!client || !text || sending) return;
    sending = true;
    try {
      await addTaskComment(client, taskId, text);
      body = "";
      await detail.refresh();
      await tick();
      scrollToBottom();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : m.error_generic());
    } finally {
      sending = false;
    }
  }

  function author(id: string | null | undefined): { name: string; color: string } | null {
    if (!id) return null;
    return detail.data?.authors[id] ?? null;
  }
</script>

<main class="mx-auto flex max-w-lg flex-col px-4" style="min-height: 100dvh">
  <Async remote={detail}>
    {#snippet skeleton()}
      <div class="space-y-3 pt-16">
        <Skeleton class="h-20" />
        <Skeleton class="h-28" />
      </div>
    {/snippet}
    {#snippet children(data)}
      {@const t = data.task}
      <ScreenHeader title={m.task_comments()} eyebrow={t.id} back={`/tasks/${t.uuid}`} />

      <div class="mt-4 flex-1 space-y-4 pb-4">
        {#if !t.comments?.length}
          <EmptyState
            icon={MessagesSquare}
            title={m.chat_empty_title()}
            description=""
          />
        {:else}
          {#each t.comments as comment (comment.id)}
            {@const who = author(comment.user)}
            <div class="flex items-start gap-2.5">
              {#if who}
                <Avatar name={who.name} color={who.color} size={24} />
              {:else}
                <span class="h-6 w-6 shrink-0 rounded-full bg-(--color-bg-inset)"></span>
              {/if}
              <div class="min-w-0 flex-1">
                <p class="text-[13px] text-(--color-text-muted)">
                  <span class="font-medium text-(--color-text)">{who?.name ?? "—"}</span>
                  <span class="font-mono text-[12px] text-(--color-text-light)">· {fullTime(comment.createdAt)}</span>
                </p>
                <p
                  class="mt-0.5 text-[14px] leading-relaxed break-words [overflow-wrap:anywhere] whitespace-pre-wrap text-(--color-text)"
                >
                  {comment.text}
                </p>
              </div>
            </div>
          {/each}
        {/if}
      </div>

      {#if data.canComment}
        <div
          class="sticky bottom-0 -mx-4 border-t border-(--color-border) bg-(--color-bg)/95 px-4 pt-3 backdrop-blur"
          style="padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px))"
        >
          <div
            class="rounded-xl border border-(--color-border) bg-(--color-bg-subtle) transition-colors focus-within:border-(--color-border-strong)"
          >
            <textarea
              bind:value={body}
              placeholder={m.task_comment_placeholder()}
              rows="1"
              enterkeyhint="send"
              class="max-h-32 min-h-11 w-full resize-none border-0 bg-transparent px-3.5 pt-3 pb-1 text-base leading-relaxed text-(--color-text) outline-none placeholder:text-(--color-text-light)"
            ></textarea>
            <div class="flex items-center px-2 pb-2">
              <button
                type="button"
                class="ml-auto grid h-8 w-8 place-items-center rounded-lg bg-(--color-accent) text-(--color-accent-fg) transition-colors disabled:opacity-50"
                disabled={sending || !body.trim()}
                aria-label={m.ticket_send()}
                onclick={() => void send()}
              >
                {#if sending}
                  <LoaderCircle size={15} class="animate-spin" />
                {:else}
                  <Send size={15} />
                {/if}
              </button>
            </div>
          </div>
        </div>
      {/if}
    {/snippet}
  </Async>
</main>
