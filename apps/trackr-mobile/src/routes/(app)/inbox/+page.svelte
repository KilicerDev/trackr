<script lang="ts">
  import { ScreenHeader } from "$lib/components/ui";
  import InboxList from "$lib/components/InboxList.svelte";
  import { m } from "$lib/paraglide/messages";

  /* Full inbox page — reached from the dashboard bell (staff). External
     users land on the same feed at "/" instead. */
</script>

<main class="mx-auto max-w-lg px-4">
  <ScreenHeader title={m.inbox_title()} back="/" />
  <div class="mt-4 pb-6">
    <InboxList />
  </div>
</main>
