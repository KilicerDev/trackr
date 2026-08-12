<script lang="ts" module>
  export type AutocompleteOption = {
    id: string;
    label: string;
    sublabel?: string;
  };
</script>

<script lang="ts">
  import Check from "@lucide/svelte/icons/check";
  import CirclePlus from "@lucide/svelte/icons/circle-plus";
  import BottomSheet from "./BottomSheet.svelte";
  import SearchInput from "./SearchInput.svelte";
  import EmptyState from "./EmptyState.svelte";
  import Skeleton from "./Skeleton.svelte";
  import SearchX from "@lucide/svelte/icons/search-x";
  import { m } from "$lib/paraglide/messages";

  /* Full-height search-and-pick sheet (workers, machines, sites, inventory).
     Full height on purpose: the list stays visible above the keyboard.
     `multi` keeps the sheet open so several picks in a row cost one tap each. */

  type Props = {
    open?: boolean;
    title: string;
    placeholder?: string;
    options: AutocompleteOption[];
    /** Marked as already picked (multi mode). */
    selectedIds?: string[];
    multi?: boolean;
    /** Renders an "add ..." row for text that matches nothing. */
    allowFreeText?: boolean;
    loading?: boolean;
    onselect: (option: AutocompleteOption) => void;
    onfreetext?: (text: string) => void;
  };

  let {
    open = $bindable(false),
    title,
    placeholder,
    options,
    selectedIds = [],
    multi = false,
    allowFreeText = false,
    loading = false,
    onselect,
    onfreetext,
  }: Props = $props();

  let query = $state("");

  $effect(() => {
    if (!open) query = "";
  });

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.sublabel?.toLowerCase().includes(q) ?? false),
    );
  });

  const exactMatch = $derived(
    filtered.some((o) => o.label.toLowerCase() === query.trim().toLowerCase()),
  );

  function pick(option: AutocompleteOption) {
    onselect(option);
    if (!multi) open = false;
  }

  function pickFreeText() {
    const text = query.trim();
    if (!text) return;
    onfreetext?.(text);
    if (multi) query = "";
    else open = false;
  }
</script>

<BottomSheet bind:open {title} height="full">
  <SearchInput bind:value={query} {placeholder} autofocus />

  <div class="mt-3 divide-y divide-(--color-border-subtle)">
    {#if allowFreeText && query.trim() && !exactMatch}
      <button
        type="button"
        onclick={pickFreeText}
        class="flex min-h-13 w-full items-center gap-3 px-1 py-3 text-left active:bg-(--color-bg-inset)"
      >
        <CirclePlus size={20} class="shrink-0 text-(--color-accent-strong)" />
        <span class="min-w-0 flex-1 truncate text-sm font-medium text-(--color-text)">
          {m.autocomplete_add_free_text({ text: query.trim() })}
        </span>
      </button>
    {/if}

    {#each filtered as option (option.id)}
      {@const picked = selectedIds.includes(option.id)}
      <button
        type="button"
        onclick={() => pick(option)}
        class="flex min-h-13 w-full items-center gap-3 px-1 py-3 text-left active:bg-(--color-bg-inset)"
      >
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium text-(--color-text)">
            {option.label}
          </span>
          {#if option.sublabel}
            <span class="block truncate text-xs text-(--color-text-muted)">
              {option.sublabel}
            </span>
          {/if}
        </span>
        {#if picked}
          <Check size={18} class="shrink-0 text-(--color-accent-strong)" />
        {/if}
      </button>
    {/each}

    {#if loading && options.length === 0}
      <div class="space-y-2 py-2">
        <Skeleton class="h-12" />
        <Skeleton class="h-12" />
        <Skeleton class="h-12" />
      </div>
    {:else if !loading && filtered.length === 0 && !query.trim()}
      <EmptyState icon={SearchX} title={m.autocomplete_empty()} class="py-10" />
    {/if}
  </div>
</BottomSheet>
