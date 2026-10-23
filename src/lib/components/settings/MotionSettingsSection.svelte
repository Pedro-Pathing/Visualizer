<script lang="ts">
  import { RotateCcw } from "@lucide/svelte";
  import type { RobotConfig } from "../../../types";
  import { DEFAULT_SETTINGS } from "../../../config/defaults";
  import Button from "../ui/Button.svelte";
  import NumberField from "../ui/NumberField.svelte";
  import { clampNumberInput } from "../../settings/numericSetting";
  import { confirmDialog } from "../../dialog";
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

  async function resetMotionParameters() {
    const confirmed = await confirmDialog({
      title: "Reset motion parameters?",
      message:
        "Velocities, acceleration limits and friction go back to their defaults. Other settings are left unchanged.",
      confirmLabel: "Reset",
    });
    if (!confirmed) return;

    project.apply(
      updateRobot({
        forwardVelocity: DEFAULT_SETTINGS.forwardVelocity,
        strafeVelocity: DEFAULT_SETTINGS.strafeVelocity,
        aVelocity: DEFAULT_SETTINGS.aVelocity,
        kFriction: DEFAULT_SETTINGS.kFriction,
        maxAcceleration: DEFAULT_SETTINGS.maxAcceleration,
        maxDeceleration: DEFAULT_SETTINGS.maxDeceleration,
      }),
    );
    showToast("Motion parameters reset to defaults", "success");
  }
</script>

<div class="flex flex-col gap-3 px-1">
  <div class="grid grid-cols-2 gap-2">
    <NumberField
      id="forward-velocity"
      label="Forward velocity (in/s)"
      value={settings.forwardVelocity}
      min={0}
      step={1}
      onInput={(v) => setNumber(v, "forwardVelocity", 0)}
    />
    <NumberField
      id="strafe-velocity"
      label="Strafe velocity (in/s)"
      value={settings.strafeVelocity}
      min={0}
      step={1}
      onInput={(v) => setNumber(v, "strafeVelocity", 0)}
    />
    <NumberField
      id="max-acceleration"
      label="Max accel (in/s²)"
      value={settings.maxAcceleration}
      min={0}
      step={1}
      onInput={(v) => setNumber(v, "maxAcceleration", 0)}
    />
    <NumberField
      id="max-deceleration"
      label="Max decel (in/s²)"
      value={settings.maxDeceleration || settings.maxAcceleration}
      min={0}
      step={1}
      onInput={(v) => setNumber(v, "maxDeceleration", 0)}
    />
    <NumberField
      id="angular-velocity"
      label="Turn rate (π rad/s)"
      value={angularVelocityDisplay}
      min={0}
      step={0.1}
      onInput={setAngularVelocity}
    />
  </div>

  <NumberField
    id="friction-coefficient"
    label="Friction coefficient"
    description="Higher values mean more resistance."
    value={settings.kFriction}
    min={0}
    step={0.1}
    onInput={(v) => setNumber(v, "kFriction", 0)}
  />

  <div>
    <Button size="sm" variant="ghost" onclick={resetMotionParameters}>
      <RotateCcw class="size-3.5" /> Reset to defaults
    </Button>
  </div>
</div>
