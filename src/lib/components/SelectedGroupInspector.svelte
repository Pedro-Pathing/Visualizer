<script lang="ts">
  import type { CompoundPath, Heading } from "../../types";
  import StatCell from "./ui/StatCell.svelte";
  import HeadingControls from "./HeadingControls.svelte";

  interface Props {
    selectedGroup: CompoundPath;
    segmentCount: number;
    onNameInput: (name: string) => void;
    onHeadingOverrideChange: (heading: Heading | undefined) => void;
    onUngroup: () => void;
  }

  let {
    selectedGroup,
    segmentCount,
    onNameInput,
    onHeadingOverrideChange,
    onUngroup,
  }: Props = $props();

  const ACTION_CLASS =
    "rounded border border-[#444444] px-2 py-1 font-semibold text-gray-100 hover:bg-[#2a2a2a] disabled:cursor-not-allowed disabled:opacity-50";

  function toggleOverride(enabled: boolean) {
    onHeadingOverrideChange(
      enabled ? { type: "tangential", reverse: false } : undefined,
    );
  }
</script>

<div
  class="w-full border border-[#333333] bg-[#222222] p-3 text-xs text-gray-400 space-y-3"
>
  <div
    class="flex items-start justify-between gap-3 border-b border-[#333333] pb-2"
  >
    <div>
      <div class="font-semibold text-gray-100">Selected Group</div>
    </div>
    <button
      class={ACTION_CLASS}
      onclick={onUngroup}
      title="Dissolve this group"
    >
      Ungroup
    </button>
  </div>

  <div class="grid grid-cols-2 gap-2 text-[11px] text-gray-300">
    <div class="border border-[#333333] bg-[#1f1f1f] px-2 py-1.5">
      <div class="text-gray-500">Name</div>
      <input
        value={selectedGroup.name || ""}
        placeholder="Group"
        type="text"
        class="w-full bg-transparent font-medium text-gray-100 border-none outline-none focus:ring-1 focus:ring-green-500 rounded px-0 py-0.5"
        oninput={(e) => onNameInput(e.currentTarget.value)}
      />
    </div>
    <StatCell label="Direct children">
      {selectedGroup.segments.length}
    </StatCell>
    <StatCell label="Paths inside">
      {segmentCount}
    </StatCell>
    <StatCell label="Heading">
      {selectedGroup.heading ? "Overridden" : "Per path"}
    </StatCell>
  </div>

  <div class="border border-[#333333] bg-[#1f1f1f] px-2 py-2 space-y-2">
    <label class="flex items-center gap-2 text-[11px] text-gray-300">
      <input
        type="checkbox"
        checked={Boolean(selectedGroup.heading)}
        onchange={(e) => toggleOverride(e.currentTarget.checked)}
      />
      <span>Override heading for the whole group</span>
    </label>
    <p class="text-[10px] leading-snug text-gray-500">
      {#if selectedGroup.heading}
        Every path inside follows this heading.
      {:else}
        Each path inside keeps its own heading.
      {/if}
    </p>

    {#if selectedGroup.heading}
      <div class="flex items-center gap-2 flex-wrap text-[11px] text-gray-300">
        <HeadingControls
          heading={selectedGroup.heading}
          onChange={onHeadingOverrideChange}
        />
      </div>
    {/if}
  </div>
</div>
