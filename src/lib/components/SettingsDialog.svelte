<script lang="ts">
  import { X } from "@lucide/svelte";
  import Modal from "./ui/Modal.svelte";
  import Button from "./ui/Button.svelte";
  import IconButton from "./ui/IconButton.svelte";
  import NumberField from "./ui/NumberField.svelte";
  import PanelSection from "./ui/PanelSection.svelte";
  import Toggle from "./ui/Toggle.svelte";
  import { fieldClass, labelClass } from "./ui/styles";
  import { confirmDialog } from "../dialog";
  import { showToast } from "../toast";
  import { PROJECT_VERSION, robotConfigOf } from "../../io";
  import { setShapes, updateRobot } from "../../model/commands";
  import { useProject } from "../../state/project.svelte";
  import type { Theme, ThemeChoice } from "../../state/theme.svelte";
  import { resetSettings } from "../../utils/settingsPersistence";
  import {
    AVAILABLE_FIELD_MAPS,
    getDefaultShapes,
  } from "../../config/defaults";
  import type { Settings } from "../../types";

  interface Props {
    isOpen?: boolean;
    /** Display preferences. Robot and motion settings belong to the project. */
    prefs: Settings;
    theme: Theme;
  }

  let {
    isOpen = $bindable(false),
    prefs = $bindable(),
    theme,
  }: Props = $props();

  const project = useProject();

  const THEMES: [ThemeChoice, string][] = [
    ["light", "Light"],
    ["dark", "Dark"],
    ["system", "System"],
  ];

  type NumericSetting = {
    [K in keyof Settings]-?: NonNullable<Settings[K]> extends number
      ? K
      : never;
  }[keyof Settings];
  type Flag = keyof NonNullable<Settings["experimentalFeatures"]>;

  function setNumber(property: NumericSetting, raw: string) {
    const value = parseFloat(raw);
    if (!Number.isNaN(value)) prefs[property] = value;
  }

  function setFlag(flag: Flag, on: boolean) {
    prefs.experimentalFeatures = { ...prefs.experimentalFeatures, [flag]: on };
  }

  function readImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === "string"
          ? resolve(reader.result)
          : reject(new Error("Unreadable image"));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function uploadFieldImage(input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) return;
    try {
      prefs.customFieldImage = await readImage(file);
    } catch (error) {
      console.error("Failed to load custom field image:", error);
      showToast("Couldn't load that image. Try a different file.", "error");
    }
  }

  async function resetAll() {
    const confirmed = await confirmDialog({
      title: "Reset all settings?",
      message:
        "Preferences go back to their defaults, and so do the open project's robot and motion settings.",
      confirmLabel: "Reset",
      danger: true,
    });
    if (!confirmed) return;
    const defaults = await resetSettings();
    prefs = { ...prefs, ...defaults };
    project.apply(updateRobot(robotConfigOf(defaults)));
  }
</script>

<Modal
  {isOpen}
  titleId="settings-title"
  onClose={() => (isOpen = false)}
  panelClass="flex max-h-[85vh] w-full max-w-xl flex-col mx-4"
>
  <div
    class="flex items-center justify-between border-b border-border px-5 py-3"
  >
    <h2 id="settings-title" class="text-base font-semibold text-heading">
      Settings
    </h2>
    <IconButton label="Close" onclick={() => (isOpen = false)}><X /></IconButton
    >
  </div>

  <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
    <p class="px-1 text-xs text-body">
      These change how the visualizer looks and behaves on this computer. The
      robot and its motion belong to the project: deselect everything to edit
      them in the inspector.
    </p>

    <PanelSection title="Display">
      <div class="flex flex-col gap-3 px-1">
        <div class="flex flex-col gap-1">
          <span class={labelClass}>Theme</span>
          <div
            class="inline-flex w-fit rounded-lg border border-border p-0.5"
            role="radiogroup"
          >
            {#each THEMES as [choice, label] (choice)}
              <button
                type="button"
                role="radio"
                aria-checked={theme.choice === choice}
                class={[
                  "rounded-md px-3 py-1 text-sm transition",
                  theme.choice === choice
                    ? "bg-primary/15 text-primary"
                    : "text-body hover:text-heading",
                ]}
                onclick={() => (theme.choice = choice)}
              >
                {label}
              </button>
            {/each}
          </div>
        </div>

        <label class="flex flex-col gap-1">
          <span class={labelClass}>Field</span>
          <select
            class={fieldClass}
            value={prefs.fieldMap}
            onchange={(event) => {
              prefs.fieldMap = event.currentTarget.value;
              project.apply(setShapes(getDefaultShapes(prefs.fieldMap)));
            }}
          >
            {#each AVAILABLE_FIELD_MAPS as field (field.value)}
              <option value={field.value}>{field.label}</option>
            {/each}
          </select>
        </label>
        {#if prefs.fieldMap === "custom"}
          <label class="flex flex-col gap-1">
            <span class={labelClass}>
              Custom field image (PNG, JPG or WEBP, square, all six tiles edge
              to edge)
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              class="text-sm text-body file:mr-3 file:rounded-lg file:border-0 file:bg-body/10 file:px-3 file:py-1.5 file:text-heading"
              onchange={(event) => uploadFieldImage(event.currentTarget)}
            />
            {#if prefs.customFieldImage}
              <span class="text-xs text-body">A custom image is loaded.</span>
            {/if}
          </label>
        {/if}

        <label class="flex flex-col gap-1">
          <span class={labelClass}>
            Path opacity
            <span class="font-mono tabular-nums">
              {Math.round((prefs.pathOpacity ?? 1) * 100)}%
            </span>
          </span>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            bind:value={prefs.pathOpacity}
          />
        </label>

        <Toggle
          label="Show points on every path"
          description="Otherwise only the selected path shows its points."
          bind:checked={prefs.showAllPoints}
        />
        <Toggle
          label="Onion layers"
          description="Draw the robot's outline at intervals along the path."
          bind:checked={prefs.showOnionLayers}
        />
        {#if prefs.showOnionLayers}
          <div class="ml-7 flex flex-col gap-3">
            <Toggle
              label="Only up to the next point"
              bind:checked={prefs.onionNextPointOnly}
            />
            <label class="flex flex-col gap-1">
              <span class={labelClass}>
                Spacing
                <span class="font-mono tabular-nums">
                  {prefs.onionLayerSpacing ?? 6}"
                </span>
              </span>
              <input
                type="range"
                min="2"
                max="20"
                step="1"
                bind:value={prefs.onionLayerSpacing}
              />
            </label>
            <label class="flex items-center gap-2">
              <input
                type="color"
                class="size-8 cursor-pointer rounded border border-border bg-transparent"
                bind:value={prefs.onionColor}
              />
              <span class={labelClass}>Outline color</span>
            </label>
          </div>
        {/if}
        <Toggle
          label="Heading arrow"
          description="Point an arrow out of the robot the way it faces."
          bind:checked={prefs.showHeadingArrow}
        />
        {#if prefs.showHeadingArrow}
          <div class="ml-7 grid grid-cols-2 gap-3">
            <label class="flex flex-col gap-1">
              <span class={labelClass}>
                Length
                <span class="font-mono tabular-nums">
                  {prefs.headingArrowLength ?? 50}px
                </span>
              </span>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                bind:value={prefs.headingArrowLength}
              />
            </label>
            <label class="flex flex-col gap-1">
              <span class={labelClass}>
                Thickness
                <span class="font-mono tabular-nums">
                  {prefs.headingArrowThickness ?? 3}px
                </span>
              </span>
              <input
                type="range"
                min="1"
                max="10"
                step="0.5"
                bind:value={prefs.headingArrowThickness}
              />
            </label>
            <label class="flex items-center gap-2">
              <input
                type="color"
                class="size-8 cursor-pointer rounded border border-border bg-transparent"
                bind:value={prefs.headingArrowColor}
              />
              <span class={labelClass}>Arrow color</span>
            </label>
          </div>
        {/if}
        <Toggle
          label="Auto-collapse panels"
          description="Hide both panels while playing or drawing, and the inspector while nothing is selected."
          bind:checked={prefs.autoCollapsePanels}
        />
      </div>
    </PanelSection>

    <PanelSection title="Advanced" open={false}>
      <div class="grid grid-cols-2 gap-3 px-1">
        <NumberField
          id="left-panel-width"
          label="Layers panel width"
          value={prefs.leftPanelWidth}
          min={0}
          step={5}
          suffix="px"
          onInput={(raw) => setNumber("leftPanelWidth", raw)}
        />
        <NumberField
          id="right-panel-width"
          label="Inspector width"
          value={prefs.rightPanelWidth}
          min={0}
          step={5}
          suffix="px"
          onInput={(raw) => setNumber("rightPanelWidth", raw)}
        />
        <NumberField
          id="left-panel-min-width"
          label="Layers minimum"
          description="0 for no limit"
          value={prefs.leftPanelMinWidth}
          min={0}
          step={5}
          suffix="px"
          onInput={(raw) => setNumber("leftPanelMinWidth", raw)}
        />
        <NumberField
          id="right-panel-min-width"
          label="Inspector minimum"
          description="0 for no limit"
          value={prefs.rightPanelMinWidth}
          min={0}
          step={5}
          suffix="px"
          onInput={(raw) => setNumber("rightPanelMinWidth", raw)}
        />
        <NumberField
          id="pen-tool-max-paths"
          label="Paths per pen stroke"
          description="0 for no limit"
          value={prefs.penToolMaxPaths}
          min={0}
          max={200}
          step={1}
          onInput={(raw) => setNumber("penToolMaxPaths", raw)}
        />
        <NumberField
          id="curve-through-max-points"
          label="Points per through-curve"
          value={prefs.curveThroughMaxPoints}
          min={1}
          max={20}
          step={1}
          onInput={(raw) => setNumber("curveThroughMaxPoints", raw)}
        />
      </div>
    </PanelSection>

    <PanelSection title="Experimental" open={false}>
      <div class="flex flex-col gap-2 px-1">
        <p class="text-xs text-body">
          Unfinished features. These features may not work correctly, so save
          your project before enabling them/
        </p>
        <Toggle
          label="Path optimizer"
          description="Adds Optimize all paths to the command palette."
          checked={prefs.experimentalFeatures?.optimize ?? false}
          onchange={(event) => setFlag("optimize", event.currentTarget.checked)}
        />
        <Toggle
          label="Through-curves"
          description="Adds a command that replaces the paths with one curve through their endpoints."
          checked={prefs.experimentalFeatures?.curveThrough ?? false}
          onchange={(event) =>
            setFlag("curveThrough", event.currentTarget.checked)}
        />
        <Toggle
          label="Obstacles and collision checks"
          checked={prefs.experimentalFeatures?.obstacles ?? false}
          onchange={(event) =>
            setFlag("obstacles", event.currentTarget.checked)}
        />
      </div>
    </PanelSection>
  </div>

  <div
    class="flex items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs text-body"
  >
    <span>
      Pedro Pathing Visualizer
      <span class="font-mono">v{PROJECT_VERSION}</span> ·
      <a
        class="underline-offset-2 hover:text-heading hover:underline"
        href="https://github.com/Pedro-Pathing/Visualizer"
        target="_blank"
        rel="noreferrer">GitHub</a
      >
    </span>
    <Button
      size="sm"
      variant="ghost"
      class="hover:text-danger"
      onclick={resetAll}
    >
      Reset all settings
    </Button>
  </div>
</Modal>
