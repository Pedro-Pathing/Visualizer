<script lang="ts">
  import type { Snippet } from "svelte";
  import { ChevronDown } from "@lucide/svelte";

  interface Props {
    title: string;
    /** Shown after the title, e.g. how many items the section holds. */
    count?: number;
    open?: boolean;
    /** Controls on the right of the header, such as an add button. */
    actions?: Snippet;
    children?: Snippet;
  }

  let {
    title,
    count,
    open = $bindable(true),
    actions,
    children,
  }: Props = $props();
</script>

<section class="flex min-h-0 flex-col">
  <div class="flex h-8 items-center gap-1 px-1">
    <button
      type="button"
      class="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs font-semibold tracking-wide text-body uppercase transition hover:text-heading"
      aria-expanded={open}
      onclick={() => (open = !open)}
    >
      <ChevronDown
        class={[
          "size-3.5 shrink-0 transition-transform",
          !open && "-rotate-90",
        ]}
      />
      <span class="truncate">{title}</span>
      {#if count !== undefined}
        <span class="font-mono font-normal tabular-nums opacity-70"
          >{count}</span
        >
      {/if}
    </button>
    {@render actions?.()}
  </div>
  {#if open}
    <div class="min-h-0 overflow-y-auto pb-2">
      {@render children?.()}
    </div>
  {/if}
</section>
