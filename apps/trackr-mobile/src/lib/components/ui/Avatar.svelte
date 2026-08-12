<script lang="ts">
  /* Initials avatar — port of the web app's Avatar.svelte. Color comes from
     the server's display directories (deterministic per user id). */

  type Props = {
    name: string;
    color: string;
    size?: number;
    /** Elevated ring so stacked/overlaid avatars separate from the surface. */
    ring?: boolean;
  };

  let { name, color, size = 24, ring = false }: Props = $props();

  const initials = $derived(
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("") || "?",
  );
</script>

<span
  class="inline-grid shrink-0 place-items-center rounded-full font-semibold text-white select-none"
  style="width: {size}px; height: {size}px; background: {color};
    font-size: {Math.max(9, Math.round(size * 0.4))}px;
    box-shadow: {ring ? '0 0 0 2px var(--color-bg-subtle)' : 'none'}"
>
  {initials}
</span>
