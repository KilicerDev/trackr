<script lang="ts">
  import Minus from "@lucide/svelte/icons/minus";
  import Plus from "@lucide/svelte/icons/plus";
  import { cn } from "$lib/utils/cn";

  /* −/＋ numeric control with long-press repeat. */

  type Props = {
    value?: number;
    step?: number;
    min?: number;
    max?: number;
    format?: (value: number) => string;
    onchange?: (value: number) => void;
    class?: string;
  };

  let {
    value = $bindable(0),
    step = 1,
    min = 0,
    max,
    format = (v) => String(v),
    onchange,
    class: className,
  }: Props = $props();

  let timer: ReturnType<typeof setTimeout> | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;

  function apply(direction: 1 | -1) {
    const next = value + direction * step;
    if (next < min) return;
    if (max !== undefined && next > max) return;
    value = next;
    onchange?.(value);
  }

  function press(direction: 1 | -1) {
    apply(direction);
    timer = setTimeout(() => {
      interval = setInterval(() => apply(direction), 80);
    }, 450);
  }

  function release() {
    if (timer) clearTimeout(timer);
    if (interval) clearInterval(interval);
    timer = null;
    interval = null;
  }

  const buttonCls =
    "flex h-11 w-11 shrink-0 items-center justify-center text-(--color-text-muted) " +
    "active:bg-(--color-bg-inset) disabled:opacity-40 transition-colors select-none";
</script>

<div
  class={cn(
    "inline-flex items-center overflow-hidden rounded-lg border border-(--color-border) bg-(--color-bg-subtle)",
    className,
  )}
>
  <button
    type="button"
    class={buttonCls}
    disabled={value - step < min}
    onpointerdown={() => press(-1)}
    onpointerup={release}
    onpointerleave={release}
    onpointercancel={release}
    oncontextmenu={(e) => e.preventDefault()}
    aria-label="−"
  >
    <Minus size={18} />
  </button>
  <span
    class="min-w-16 flex-1 border-x border-(--color-border-subtle) px-2 text-center text-sm font-medium text-(--color-text) tabular-nums"
  >
    {format(value)}
  </span>
  <button
    type="button"
    class={buttonCls}
    disabled={max !== undefined && value + step > max}
    onpointerdown={() => press(1)}
    onpointerup={release}
    onpointerleave={release}
    onpointercancel={release}
    oncontextmenu={(e) => e.preventDefault()}
    aria-label="+"
  >
    <Plus size={18} />
  </button>
</div>
