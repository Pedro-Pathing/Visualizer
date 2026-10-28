<script lang="ts">
  import type { Prefs } from "../../state/prefs.svelte";
  import PanelSection from "../../lib/components/ui/PanelSection.svelte";
  import StartingPointSection from "../../lib/components/StartingPointSection.svelte";
  import RobotSettingsSection from "../../lib/components/settings/RobotSettingsSection.svelte";
  import MotionSettingsSection from "../../lib/components/settings/MotionSettingsSection.svelte";

  interface Props {
    prefs: Prefs;
  }

  let { prefs }: Props = $props();
</script>

<div class="flex flex-col gap-2">
  <PanelSection title="Start">
    <StartingPointSection />
  </PanelSection>
  <PanelSection title="Robot" open={false}>
    <RobotSettingsSection bind:settings={prefs.value} />
  </PanelSection>
  <PanelSection title="Motion" open={false}>
    <MotionSettingsSection />
  </PanelSection>
</div>
