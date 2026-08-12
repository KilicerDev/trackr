<script lang="ts">
  import Send from "@lucide/svelte/icons/send";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import { tick } from "svelte";
  import { page } from "$app/state";
  import { Async, Avatar, ScreenHeader, Skeleton } from "$lib/components/ui";
  import { getThread, postThreadMessage } from "$lib/api/chat";
  import { markRead } from "$lib/api/inbox";
  import { remote } from "$lib/api/remote.svelte";
  import { session } from "$lib/session.svelte";
  import { fullTime } from "$lib/utils/time";
  import { toast } from "$lib/stores/toast.svelte";
  import { m } from "$lib/paraglide/messages";

  /* One chat thread: messages + sticky reply. Opening it bumps the server
     read-cursor (in the GET) and clears its inbox rows. */

  const threadId = $derived(page.params.id!);

  const thread = remote(
    () => threadId,
    (client, id) => getThread(client, id),
  );

  $effect(() => {
    const client = session.client;
    const id = threadId;
    if (!client || !id) return;
    void markRead(client, { entityType: "thread", entityId: id }).catch(() => {});
  });

  let body = $state("");
  let sending = $state(false);

  /* Same messaging scroll behavior as the ticket timeline: open at the
     newest message, window to PAGE entries, anchor on "show older". */
  const PAGE = 40;
  let visibleCount = $state(PAGE);
  let scrolledFor = $state<string | null>(null);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
  }

  $effect(() => {
    const id = threadId;
    if (!thread.data || scrolledFor === id) return;
    scrolledFor = id;
    visibleCount = PAGE;
    void tick().then(scrollToBottom);
  });

  async function showOlder() {
    const el = document.documentElement;
    const prevHeight = el.scrollHeight;
    visibleCount += PAGE;
    await tick();
    window.scrollBy(0, el.scrollHeight - prevHeight);
  }

  async function send() {
    const client = session.client;
    const text = body.trim();
    if (!client || !text || sending) return;
    sending = true;
    try {
      await postThreadMessage(client, threadId, text);
      body = "";
      await thread.refresh();
      await tick();
      scrollToBottom();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : m.error_generic());
    } finally {
      sending = false;
    }
  }
</script>

<main
  class="mx-auto flex max-w-lg flex-col px-4"
  style="min-height: 100dvh"
>
  <Async remote={thread}>
    {#snippet skeleton()}
      <div class="space-y-3 pt-16">
        <Skeleton class="h-20" />
        <Skeleton class="h-28" />
      </div>
    {/snippet}
    {#snippet children(data)}
      <ScreenHeader title={data.thread.title ?? m.chat_title()} back="/chat" />

      {@const hiddenCount = Math.max(0, data.messages.length - visibleCount)}
      {@const shown = hiddenCount > 0 ? data.messages.slice(hiddenCount) : data.messages}

      <!-- Web chat rows: avatar + name + mono time, plain body text — the
           web app has no own/other bubble styling anywhere. -->
      <div class="mt-4 flex-1 space-y-4 pb-4">
        {#if hiddenCount > 0}
          <button
            type="button"
            class="mx-auto mb-2 block rounded-lg border border-(--color-border) px-4 py-1.5 text-[13px] text-(--color-text-muted) transition-colors active:bg-(--color-bg-inset)"
            onclick={() => void showOlder()}
          >
            {m.timeline_show_older({ count: Math.min(PAGE, hiddenCount) })}
          </button>
        {/if}
        {#each shown as msg (msg.id)}
          {#if msg.kind === "system"}
            <p class="px-2 text-center text-xs text-(--color-text-light)">
              {msg.body} · {fullTime(msg.createdAt)}
            </p>
          {:else}
            {@const who = msg.authorId ? data.authors[msg.authorId] : null}
            <div class="flex items-start gap-2.5">
              {#if who}
                <Avatar name={who.name} color={who.color} size={24} />
              {:else}
                <span class="h-6 w-6 shrink-0 rounded-full bg-(--color-bg-inset)"></span>
              {/if}
              <div class="min-w-0 flex-1">
                <p class="text-[13px] text-(--color-text-muted)">
                  <span class="font-medium text-(--color-text)">{who?.name ?? "—"}</span>
                  <span class="font-mono text-[12px] text-(--color-text-light)">· {fullTime(msg.createdAt)}</span>
                </p>
                <p
                  class="mt-0.5 text-[14px] leading-relaxed break-words [overflow-wrap:anywhere] whitespace-pre-wrap text-(--color-text)"
                >
                  {msg.body}
                </p>
              </div>
            </div>
          {/if}
        {/each}
      </div>

      <div
        class="sticky bottom-0 -mx-4 border-t border-(--color-border) bg-(--color-bg)/95 px-4 pt-3 backdrop-blur"
          style="padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px))"
      >
        <div
          class="rounded-xl border border-(--color-border) bg-(--color-bg-subtle) transition-colors focus-within:border-(--color-border-strong)"
        >
          <textarea
            bind:value={body}
            placeholder={m.chat_reply_placeholder()}
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
    {/snippet}
  </Async>
</main>
