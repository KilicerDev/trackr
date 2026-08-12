<script lang="ts">
  import { fly } from "svelte/transition";
  import CircleCheck from "@lucide/svelte/icons/circle-check";
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import Info from "@lucide/svelte/icons/info";
  import { toast, type ToastKind } from "$lib/stores/toast.svelte";

  /* Dark pills floating above the tab bar; tap to dismiss. */

  const icons: Record<ToastKind, typeof CircleCheck> = {
    success: CircleCheck,
    error: CircleAlert,
    info: Info,
  };

  const iconColors: Record<ToastKind, string> = {
    success: "text-(--color-status-success-dot)",
    error: "text-(--color-status-error-dot)",
    info: "text-(--color-status-info-dot)",
  };
</script>

<div
  class="pointer-events-none fixed inset-x-0 z-60 flex flex-col items-center gap-2 px-5"
  style="bottom: calc(env(safe-area-inset-bottom, 0px) + 4.5rem)"
>
  {#each toast.items as item (item.id)}
    {@const ToastIcon = icons[item.kind]}
    <button
      type="button"
      class="pointer-events-auto flex w-full max-w-md items-center gap-2.5 rounded-xl bg-(--color-dark) px-4 py-3 text-left shadow-soft"
      transition:fly={{ y: 24, duration: 200 }}
      onclick={() => toast.dismiss(item.id)}
    >
      <ToastIcon size={18} class="shrink-0 {iconColors[item.kind]}" />
      <span class="min-w-0 flex-1 text-sm text-(--color-dark-fg)">
        {item.message}
      </span>
    </button>
  {/each}
</div>
