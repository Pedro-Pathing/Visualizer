<script lang="ts">
  import type { MenuEntry } from "./menu";
  import { surfaceClass } from "./styles";

  interface Props {
    entries: MenuEntry[];
    onPick: () => void;
    class?: string;
  }

  let { entries, onPick, class: className = "" }: Props = $props();
</script>

<div
  class={[
    surfaceClass,
    "min-w-52 bg-surface/95 p-1 text-sm shadow-lg",
    className,
  ]}
  role="menu"
>
  {#each entries as entry, index (index)}
    {#if entry === "separator"}
      <div class="my-1 h-px bg-border" role="separator"></div>
    {:else}
      <button
        type="button"
        role="menuitem"
        disabled={entry.disabled}
        class={[
          "flex w-full items-center justify-between gap-6 rounded-lg px-2.5 py-1.5 text-left transition outline-none hover:bg-body/10 focus-visible:bg-body/10 disabled:pointer-events-none disabled:opacity-40",
          entry.danger ? "text-danger" : "text-heading",
        ]}
        onclick={() => {
          onPick();
          entry.run();
        }}
      >
        <span>{entry.label}</span>
        {#if entry.hint}
          <span class="font-mono text-xs text-body">{entry.hint}</span>
        {/if}
      </button>
    {/if}
  {/each}
</div>
