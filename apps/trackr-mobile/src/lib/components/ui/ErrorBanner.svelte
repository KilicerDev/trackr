<script lang="ts">
  import CloudOff from "@lucide/svelte/icons/cloud-off";
  import Button from "./Button.svelte";
  import { cn } from "$lib/utils/cn";
  import { m } from "$lib/paraglide/messages";

  /* Inline load-failure banner for form screens that render without an Async
     shell — surfaces the error where a silent empty picker would otherwise
     hide it. */

  type Props = {
    message?: string;
    onretry?: () => void;
    class?: string;
  };

  let { message, onretry, class: className }: Props = $props();
</script>

<div
  class={cn(
    "flex items-center gap-3 rounded-xl bg-(--color-status-error-bg) px-4 py-3",
    className,
  )}
>
  <CloudOff size={18} class="shrink-0 text-(--color-status-error-dot)" />
  <p class="min-w-0 flex-1 text-sm text-(--color-status-error-text)">
    {message ?? m.error_load_failed()}
  </p>
  {#if onretry}
    <Button variant="outline" size="sm" onclick={onretry}>
      {m.common_retry()}
    </Button>
  {/if}
</div>
