<script lang="ts">
  import type { RobotConfig, Settings } from "../../../types";
  import NumberField from "../ui/NumberField.svelte";
  import RobotImagePicker from "./RobotImagePicker.svelte";
  import { clampNumberInput } from "../../settings/numericSetting";
  import { updateRobot } from "../../../model/commands";
  import { useProject } from "../../../state/project.svelte";

  interface Props {
    /** Display preferences: the robot image and heading arrow. */
    settings: Settings;
  }

  let { settings = $bindable() }: Props = $props();

  const project = useProject();
  let robot = $derived(project.doc.robot);

  function setNumber(
    value: string,
    property: keyof RobotConfig,
    min?: number,
    max?: number,
  ) {
    project.apply(
      updateRobot({ [property]: clampNumberInput(value, min, max) }),
      { coalesce: `robot.${property}` },
    );
  }
</script>

<div class="console-section mt-2 space-y-3 p-3">
  <NumberField
    id="robot-width"
    label="Robot Width (in)"
    description="Width of the robot base"
    value={robot.rWidth}
    min={1}
    max={36}
    step={0.5}
    onInput={(v) => setNumber(v, "rWidth", 1, 36)}
  />

  <NumberField
    id="robot-height"
    label="Robot Height (in)"
    description="Height of the robot base"
    value={robot.rHeight}
    min={1}
    max={36}
    step={0.5}
    onInput={(v) => setNumber(v, "rHeight", 1, 36)}
  />

  <NumberField
    id="safety-margin"
    label="Safety Margin (in)"
    description="Buffer around obstacles"
    value={robot.safetyMargin}
    min={0}
    max={24}
    step={0.5}
    onInput={(v) => setNumber(v, "safetyMargin", 0, 24)}
  />

  <RobotImagePicker bind:settings />

  <!-- Heading Arrow Toggle -->
  <div>
    <label class="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        bind:checked={settings.showHeadingArrow}
        class="console-checkbox w-4 h-4 text-blue-500 focus:ring-2 focus:ring-blue-500 cursor-pointer"
      />
      <span class="text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Show Heading Arrow
      </span>
    </label>
    <div class="text-xs text-neutral-500 dark:text-neutral-400 ml-6 mt-1">
      Display an arrow showing the robot's current heading direction
    </div>
  </div>
</div>
