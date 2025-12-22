<script lang="ts">
  export let name: string;
  export let durationMs: number;
  export let locked: boolean = false;
  export let onToggleLock: () => void;
  export let onChange: (newName: string, newDuration: number) => void;
  export let onRemove: () => void;
  export let onInsertAfter: () => void;
  export let onAddPathAfter: () => void;
  export let onMoveUp: () => void;
  export let onMoveDown: () => void;
  export let canMoveUp: boolean = true;
  export let canMoveDown: boolean = true;

  function handleNameChange(e: Event) {
    const target = e.currentTarget as HTMLInputElement;
    if (!locked) onChange(target?.value ?? "", durationMs);
  }

  function handleDurationChange(e: Event) {
    const target = e.currentTarget as HTMLInputElement;
    const v = Number(target?.value ?? 0);
    if (!locked) onChange(name, Math.max(0, Number.isFinite(v) ? v : 0));
  }
</script>

<div
  class="flex w-full items-center justify-between gap-2 px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-900"
>
  <div class="flex items-center gap-2">
    <span
      class="px-1.5 py-0.5 text-xs rounded bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
      >Wait</span
    >
    <input
      class="pl-1.5 rounded-md bg-neutral-50 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-40"
      type="text"
      placeholder="Name"
      bind:value={name}
      on:change={handleNameChange}
      disabled={locked}
    />
    <input
      class="pl-1.5 rounded-md bg-neutral-50 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-28"
      type="number"
      min="0"
      step="50"
      bind:value={durationMs}
      on:change={handleDurationChange}
      disabled={locked}
    />
    <span>ms</span>
  </div>

  <div class="flex items-center gap-2">
    <!-- Lock/Unlock Button -->
    <button
      title={locked ? "Unlock Wait" : "Lock Wait"}
      on:click|stopPropagation={() => {
        if (onToggleLock) onToggleLock();
      }}
      class="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
    >
      {#if locked}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width={2}
          stroke="currentColor"
          class="size-5 stroke-yellow-500"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
          />
        </svg>
      {:else}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width={2}
          stroke="currentColor"
          class="size-5 stroke-gray-400"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
          />
        </svg>
      {/if}
    </button>

    <div class="flex flex-row gap-0.5 mr-1">
      <button
        title="Move up"
        on:click={() => {
          if (!locked && onMoveUp) onMoveUp();
        }}
        class="p-1 rounded-full text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 bg-neutral-100/70 dark:bg-neutral-900/70 border border-neutral-200/70 dark:border-neutral-700/70 disabled:opacity-40 disabled:cursor-not-allowed"
        disabled={!canMoveUp || locked}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="size-4"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="m5 15 7-7 7 7"
          />
        </svg>
      </button>
      <button
        title="Move down"
        on:click={() => {
          if (!locked && onMoveDown) onMoveDown();
        }}
        class="p-1 rounded-full text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 bg-neutral-100/70 dark:bg-neutral-900/70 border border-neutral-200/70 dark:border-neutral-700/70 disabled:opacity-40 disabled:cursor-not-allowed"
        disabled={!canMoveDown || locked}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="size-4"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="m19 9-7 7-7-7"
          />
        </svg>
      </button>
    </div>

    <button
      title="Add path after"
      on:click={() => {
        if (!locked && onAddPathAfter) onAddPathAfter();
      }}
      class="text-green-500 hover:text-green-600"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width={2}
        stroke="currentColor"
        class="size-5"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M12 4.5v15m7.5-7.5h-15"
        />
      </svg>
    </button>

    <button
      title="Add wait after"
      on:click={() => {
        if (!locked && onInsertAfter) onInsertAfter();
      }}
      class="text-amber-500 hover:text-amber-600"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class="size-5"
      >
        <circle cx="12" cy="12" r="9" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 7v5l3 2" />
      </svg>
    </button>

    <button
      title="Remove"
      on:click={() => {
        if (!locked && onRemove) onRemove();
      }}
      class="text-red-500 hover:text-red-600"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class="size-5"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
        />
      </svg>
    </button>
  </div>
</div>
