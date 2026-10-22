<script lang="ts">
  import type { Settings } from "../../types";
  import ControlTab from "../ControlTab.svelte";

  interface Props {
    hidden?: boolean;
    settings: Settings;
    onToggleVisibility: () => void;
  }

  let { hidden = false, settings, onToggleVisibility }: Props = $props();
</script>

<aside
  class="panel-box side-rail side-rail-right"
  class:side-rail--collapsed={hidden}
>
  <div class="module-box control-panel-header">
    <div class="module-header-row">
      <div>
        <h3 class="module-title">Controls</h3>
        <p class="module-caption">Edit playback, paths, and robot settings.</p>
      </div>
      <button
        class="panel-toggle-btn"
        type="button"
        onclick={onToggleVisibility}
        aria-label={hidden ? "Show right panel" : "Hide right panel"}
        title={hidden ? "Show right panel" : "Hide right panel"}
      >
        {hidden ? "‹" : "›"}
      </button>
    </div>
  </div>
  <ControlTab {settings} />
</aside>
