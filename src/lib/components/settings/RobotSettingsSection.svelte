<script lang="ts">
  import type { RobotConfig, Settings } from "../../../types";
  import NumberField from "../ui/NumberField.svelte";
  import RobotImagePicker from "./RobotImagePicker.svelte";
  import { clampNumberInput } from "../../settings/numericSetting";
  import { updateRobot } from "../../../model/commands";
  import { useProject } from "../../../state/project.svelte";

  interface Props {
    /** Display preferences: the robot image. */
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

<div class="flex flex-col gap-3 px-1">
  <div class="grid grid-cols-2 gap-2">
    <NumberField
      id="robot-length"
      label="Length (in)"
      value={robot.rLength}
      min={1}
      max={36}
      step={0.5}
      onInput={(v) => setNumber(v, "rLength", 1, 36)}
    />
    <NumberField
      id="robot-width"
      label="Width (in)"
      value={robot.rWidth}
      min={1}
      max={36}
      step={0.5}
      onInput={(v) => setNumber(v, "rWidth", 1, 36)}
    />
  </div>

  <NumberField
    id="robot-pivot-forward"
    label="Drivetrain X Offset (in)"
    description="Measured from the frane center to the drivetrain center. Positive is forward."
    value={robot.drivetrainOffsetX}
    step={0.1}
    onInput={(v) => setNumber(v, "drivetrainOffsetX")}
  />
  <NumberField
    id="robot-pivot-left"
    label="Drivetrain Y offset (in)"
    description="Measured from the frame center to the drivetrain center. Positive is left."
    value={robot.drivetrainOffsetY}
    step={0.1}
    onInput={(v) => setNumber(v, "drivetrainOffsetY")}
  />

  <NumberField
    id="safety-margin"
    label="Safety margin (in)"
    description="Buffer kept around obstacles."
    value={robot.safetyMargin}
    min={0}
    max={24}
    step={0.5}
    onInput={(v) => setNumber(v, "safetyMargin", 0, 24)}
  />

  <RobotImagePicker bind:settings />
</div>
