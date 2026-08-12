<script lang="ts">
  import { taskStatusColor } from "$lib/utils/tasks";

  /* Task-status glyph — port of the web app's StatusDot.svelte: backlog =
     dashed ring, todo = ring, in_progress / in_review = ring + partial fill,
     paused = ring + bar, done = solid disc. */

  type Props = {
    status: string;
    size?: number;
  };

  let { status, size = 15 }: Props = $props();

  const color = $derived(taskStatusColor(status));
</script>

<span
  class="relative inline-grid shrink-0 place-items-center rounded-full {status === 'backlog'
    ? 'border-[1.5px] border-dashed opacity-70'
    : status === 'done'
      ? ''
      : 'border-[1.5px]'}"
  style="width: {size}px; height: {size}px; border-color: {color};
    {status === 'done' ? `background: ${color};` : ''}"
  aria-hidden="true"
>
  {#if status === "in_progress" || status === "in_review"}
    <span
      class="absolute rounded-full"
      style="inset: 2px; background: conic-gradient({color} {status === 'in_progress'
        ? '60%'
        : '75%'}, transparent 0)"
    ></span>
  {:else if status === "paused"}
    <span
      class="absolute rounded-[1px]"
      style="width: {Math.round(size * 0.45)}px; height: {Math.max(2, Math.round(size * 0.18))}px; background: {color}"
    ></span>
  {/if}
</span>
