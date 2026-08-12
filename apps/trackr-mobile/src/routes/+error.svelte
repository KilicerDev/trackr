<script lang="ts">
  import CloudOff from "@lucide/svelte/icons/cloud-off";
  import { EmptyState, Button } from "$lib/components/ui";
  import { m } from "$lib/paraglide/messages";

  /* Route-level error boundary — without this a bad route renders a bare
     black screen in the WebView. */
</script>

<main class="flex min-h-dvh flex-col items-center justify-center px-6">
  <EmptyState icon={CloudOff} title={m.error_load_failed()}>
    {#snippet action()}
      <Button variant="outline" onclick={() => (window.location.href = "/")}>
        {m.common_back()}
      </Button>
    {/snippet}
  </EmptyState>
</main>
