<script lang="ts">
  /* Three ascending signal bars — port of the web app's PriorityBars.svelte.
     `level` 0–4 (none…urgent); bars beyond the level render dimmed. */

  type Props = {
    color: string;
    level: number;
  };

  let { color, level }: Props = $props();

  const HEIGHTS = [5, 8, 11];
</script>

<span class="inline-flex h-[13px] shrink-0 items-end gap-[2px]" aria-hidden="true">
  {#each HEIGHTS as height, i (height)}
    <span
      class="w-[4px] rounded-[1px]"
      style="height: {height}px; background: {color};
        opacity: {i < Math.min(level, 3) ? 1 : 0.35}"
    ></span>
  {/each}
</span>
