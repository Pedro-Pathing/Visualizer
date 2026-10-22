<script lang="ts">
  import type { RobotConfig } from "../../../types";
  import { DEFAULT_SETTINGS } from "../../../config/defaults";
  import NumberField from "../ui/NumberField.svelte";
  import { clampNumberInput } from "../../settings/numericSetting";
  import { showToast } from "../../toast";
  import { updateRobot } from "../../../model/commands";
  import { useProject } from "../../../state/project.svelte";

  const project = useProject();
  let settings = $derived(project.doc.robot);

  let angularVelocityDisplay = $derived(settings.aVelocity / Math.PI);

  function setRobot(patch: Partial<RobotConfig>, field: string) {
    project.apply(updateRobot(patch), { coalesce: `robot.${field}` });
  }

  function setNumber(
    value: string,
    property: keyof RobotConfig,
    min?: number,
    max?: number,
  ) {
    setRobot({ [property]: clampNumberInput(value, min, max) }, property);
  }

  function setAngularVelocity(value: string) {
    const parsed = parseFloat(value);
    setRobot(
      { aVelocity: (Number.isNaN(parsed) ? 0 : parsed) * Math.PI },
      "aVelocity",
    );
  }

  function resetMotionParameters() {
    if (
      !confirm(
        "Reset motion parameters to defaults? Other settings will be left unchanged.",
      )
    ) {
      return;
    }

    project.apply(
      updateRobot({
        xVelocity: DEFAULT_SETTINGS.xVelocity,
        yVelocity: DEFAULT_SETTINGS.yVelocity,
        aVelocity: DEFAULT_SETTINGS.aVelocity,
        kFriction: DEFAULT_SETTINGS.kFriction,
        maxVelocity: DEFAULT_SETTINGS.maxVelocity,
        maxAcceleration: DEFAULT_SETTINGS.maxAcceleration,
        maxDeceleration: DEFAULT_SETTINGS.maxDeceleration,
      }),
    );
    showToast("Motion parameters reset to defaults", "success");
  }
</script>

<div class="mt-2 space-y-3 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg">
  <!-- Velocity Settings -->
  <div class="grid grid-cols-2 gap-3">
    <NumberField
      id="x-velocity"
      label="X Velocity (in/s)"
      value={settings.xVelocity}
      min={0}
      step={1}
      onInput={(v) => setNumber(v, "xVelocity", 0)}
    />

    <NumberField
      id="y-velocity"
      label="Y Velocity (in/s)"
      value={settings.yVelocity}
      min={0}
      step={1}
      onInput={(v) => setNumber(v, "yVelocity", 0)}
    />
  </div>

  <!-- Angular Velocity -->
  <NumberField
    id="angular-velocity"
    label="Angular Velocity (π rad/s)"
    description="Multiplier of π radians per second"
    value={angularVelocityDisplay}
    min={0}
    step={0.1}
    onInput={setAngularVelocity}
  />

  <!-- Velocity Limits -->
  <NumberField
    id="max-velocity"
    label="Max Velocity (in/s)"
    value={settings.maxVelocity}
    min={0}
    step={1}
    onInput={(v) => setNumber(v, "maxVelocity", 0)}
  />

  <!-- Acceleration Limits -->
  <div class="grid grid-cols-2 gap-3">
    <NumberField
      id="max-acceleration"
      label="Max Acceleration (in/s²)"
      value={settings.maxAcceleration}
      min={0}
      step={1}
      onInput={(v) => setNumber(v, "maxAcceleration", 0)}
    />

    <NumberField
      id="max-deceleration"
      label="Max Deceleration (in/s²)"
      value={settings.maxDeceleration || settings.maxAcceleration}
      min={0}
      step={1}
      onInput={(v) => setNumber(v, "maxDeceleration", 0)}
    />
  </div>

  <!-- Friction -->
  <NumberField
    id="friction-coefficient"
    label="Friction Coefficient"
    description="Higher values = more resistance"
    value={settings.kFriction}
    min={0}
    step={0.1}
    onInput={(v) => setNumber(v, "kFriction", 0)}
  />

  <div class="pt-1">
    <button
      type="button"
      onclick={resetMotionParameters}
      class="px-3 py-1.5 text-sm bg-red-500/90 hover:bg-red-600 text-white rounded-md transition-colors flex items-center gap-2"
      title="Reset motion parameters to default values"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width={2}
        stroke="currentColor"
        class="size-4"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
        />
      </svg>
      Reset Motion Parameters
    </button>
  </div>
</div>
