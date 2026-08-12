<script lang="ts" generics="A, T">
  import type { Snippet } from "svelte";
  import CloudOff from "@lucide/svelte/icons/cloud-off";
  import type { Remote } from "$lib/api/remote.svelte";
  import Button from "./Button.svelte";
  import EmptyState from "./EmptyState.svelte";
  import Skeleton from "./Skeleton.svelte";
  import { m } from "$lib/paraglide/messages";

  /* Standard skeleton / error-retry / content shell around a Remote. */

  type Props = {
    remote: Remote<A, T>;
    skeleton?: Snippet;
    children: Snippet<[T]>;
  };

  let { remote, skeleton, children }: Props = $props();
</script>

{#if remote.data !== null}
  {@render children(remote.data)}
{:else if remote.loading}
  {#if skeleton}
    {@render skeleton()}
  {:else}
    <div class="mt-4 space-y-3">
      <Skeleton class="h-28" />
      <Skeleton class="h-16" />
    </div>
  {/if}
{:else if remote.error}
  <EmptyState
    icon={CloudOff}
    title={remote.error.kind === "network"
      ? m.error_offline()
      : remote.error.message || m.error_generic()}
  >
    {#snippet action()}
      <Button variant="outline" size="md" onclick={() => remote.refresh()}>
        {m.common_retry()}
      </Button>
    {/snippet}
  </EmptyState>
{/if}
