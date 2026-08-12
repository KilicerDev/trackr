<script lang="ts">
  import BottomSheet from "./BottomSheet.svelte";
  import Button from "./Button.svelte";
  import { confirmSheet } from "$lib/stores/confirm.svelte";
  import { m } from "$lib/paraglide/messages";

  /* App-styled replacement for native confirm(). Driven by the confirm
     store; mounted once in the root layout. Backdrop tap and the X both
     count as cancel. */
</script>

<BottomSheet
  bind:open={confirmSheet.open}
  title={confirmSheet.options.title}
  onclose={() => confirmSheet.settle(false)}
>
  <p class="pt-1 text-base text-(--color-text)">
    {confirmSheet.options.message}
  </p>

  {#snippet footer()}
    <div class="flex gap-3">
      <Button
        variant="outline"
        size="lg"
        class="flex-1"
        onclick={() => confirmSheet.settle(false)}
      >
        {m.common_cancel()}
      </Button>
      <Button
        variant={confirmSheet.options.danger ? "danger" : "primary"}
        size="lg"
        class="flex-1"
        onclick={() => confirmSheet.settle(true)}
      >
        {confirmSheet.options.confirmLabel}
      </Button>
    </div>
  {/snippet}
</BottomSheet>
