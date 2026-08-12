<script lang="ts">
  import { cn } from "$lib/utils/cn";

  /* The web app's brand mark — three coral track bars + plain wordmark
     (web/src/lib/components/auth/BrandMark.svelte). */

  type Size = "md" | "lg";

  type Props = {
    size?: Size;
    class?: string;
  };

  let { size = "md", class: className }: Props = $props();

  const markSizes: Record<Size, number> = { md: 22, lg: 26 };
  const wordmarkSizes: Record<Size, string> = { md: "text-[17px]", lg: "text-[20px]" };
</script>

<span class={cn("inline-flex shrink-0 items-center gap-2.5", className)}>
  <svg
    width={markSizes[size]}
    height={markSizes[size]}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <rect x="1.26971" y="1.2627" width="3.65721" height="13.4566" rx="1" fill="#FF4867" />
    <rect x="6.146" y="1.2627" width="3.65721" height="13.4566" rx="1" fill="#FF4867" />
    <rect x="11.0223" y="1.2627" width="3.65721" height="13.4566" rx="1" fill="#FF4867" />
  </svg>
  <span class={cn("font-semibold tracking-[-0.01em] text-(--color-text)", wordmarkSizes[size])}>
    Trackr
  </span>
</span>
