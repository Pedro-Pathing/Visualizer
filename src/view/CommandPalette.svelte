<script lang="ts">
  import { Search } from "@lucide/svelte";
  import { formatKeys } from "../lib/shortcuts";
  import { surfaceClass } from "../lib/components/ui/styles";
  import type { Action } from "./actions";

  interface Props {
    actions: Action[];
    open: boolean;
  }

  let { actions, open = $bindable() }: Props = $props();

  let query = $state("");
  let active = $state(0);

  /** Available actions whose title or group contains every word typed. */
  let matches = $derived.by(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return actions.filter(
      (action) =>
        action.id !== "app.palette" &&
        (action.when?.() ?? true) &&
        words.every((word) =>
          `${action.group} ${action.title}`.toLowerCase().includes(word),
        ),
    );
  });

  $effect(() => {
    void query;
    active = 0;
  });

  function close() {
    open = false;
    query = "";
  }

  function run(action: Action | undefined) {
    if (!action) return;
    close();
    action.run();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      active = Math.min(active + 1, matches.length - 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      active = Math.max(active - 1, 0);
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(matches[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  function focus(node: HTMLInputElement) {
    node.focus();
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-2000 flex items-start justify-center bg-black/40 pt-[15vh]"
    onclick={(event) => {
      if (event.target === event.currentTarget) close();
    }}
  >
    <div
      class={[
        surfaceClass,
        "w-full max-w-lg overflow-hidden bg-surface shadow-xl",
      ]}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div class="flex items-center gap-2 border-b border-border px-3">
        <Search class="size-4 text-body" />
        <input
          use:focus
          bind:value={query}
          onkeydown={onKeyDown}
          placeholder="Type a command"
          class="h-11 flex-1 bg-transparent text-sm outline-none"
          aria-label="Command"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-results"
          aria-activedescendant={matches[active]
            ? `palette-${matches[active].id}`
            : undefined}
        />
      </div>
      <ul
        id="palette-results"
        class="max-h-80 overflow-y-auto p-1"
        role="listbox"
      >
        {#each matches as action, index (action.id)}
          <li
            id={`palette-${action.id}`}
            role="option"
            aria-selected={index === active}
            class={[
              "flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-1.5 text-sm",
              index === active ? "bg-primary/12 text-heading" : "text-body",
            ]}
            onpointermove={() => (active = index)}
            onclick={() => run(action)}
          >
            <span class="w-20 shrink-0 text-xs opacity-70">{action.group}</span>
            <span class="flex-1 text-heading">{action.title}</span>
            {#if action.keys?.[0]}
              <kbd class="font-mono text-xs opacity-70"
                >{formatKeys(action.keys[0])}</kbd
              >
            {/if}
          </li>
        {/each}
        {#if matches.length === 0}
          <li class="px-2.5 py-3 text-sm text-body">No matching command.</li>
        {/if}
      </ul>
    </div>
  </div>
{/if}
