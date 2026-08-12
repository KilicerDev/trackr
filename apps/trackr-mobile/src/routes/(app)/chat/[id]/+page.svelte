<script lang="ts">
  import Send from "@lucide/svelte/icons/send";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import { page } from "$app/state";
  import { Async, ScreenHeader, Skeleton } from "$lib/components/ui";
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

  async function send() {
    const client = session.client;
    const text = body.trim();
    if (!client || !text || sending) return;
    sending = true;
    try {
      await postThreadMessage(client, threadId, text);
      body = "";
      await thread.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : m.error_generic());
    } finally {
      sending = false;
    }
  }
</script>

<main
  class="mx-auto flex max-w-lg flex-col px-4"
  style="min-height: calc(100dvh - env(safe-area-inset-bottom, 0px) - 3.5rem)"
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

      <div class="mt-4 flex-1 space-y-3 pb-4">
        {#each data.messages as msg (msg.id)}
          {#if msg.kind === "system"}
            <p class="px-2 text-center text-xs text-(--color-text-light)">
              {msg.body} · {fullTime(msg.createdAt)}
            </p>
          {:else}
            {@const mine = msg.authorId === session.user?.id}
            <div class={mine ? "flex justify-end" : "flex justify-start"}>
              <div
                class="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap {mine
                  ? 'bg-(--color-accent) text-(--color-accent-fg)'
                  : 'border border-(--color-border) bg-(--color-bg-subtle) text-(--color-text)'}"
              >
                {msg.body}
                <p
                  class="mt-1 text-right text-[10px] {mine
                    ? 'text-(--color-accent-fg)/70'
                    : 'text-(--color-text-light)'}"
                >
                  {fullTime(msg.createdAt)}
                </p>
              </div>
            </div>
          {/if}
        {/each}
      </div>

      <div
        class="sticky bottom-0 -mx-4 border-t border-(--color-border) bg-(--color-bg)/95 px-4 py-3 backdrop-blur"
      >
        <div class="flex items-end gap-2">
          <textarea
            bind:value={body}
            placeholder={m.chat_reply_placeholder()}
            rows="1"
            enterkeyhint="send"
            class="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-(--color-border) bg-(--color-bg-subtle) px-3.5 py-2.5 text-base text-(--color-text) placeholder:text-(--color-text-light) focus:border-(--color-accent) focus:ring-2 focus:ring-(--color-accent)/40"
          ></textarea>
          <button
            type="button"
            class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-(--color-accent) text-(--color-accent-fg) disabled:opacity-50"
            disabled={sending || !body.trim()}
            aria-label={m.ticket_send()}
            onclick={() => void send()}
          >
            {#if sending}
              <LoaderCircle size={18} class="animate-spin" />
            {:else}
              <Send size={18} />
            {/if}
          </button>
        </div>
      </div>
    {/snippet}
  </Async>
</main>
