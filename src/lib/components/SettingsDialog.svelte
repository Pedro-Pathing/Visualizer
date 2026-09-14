<script lang="ts">
  import Modal from "./ui/Modal.svelte";
  import CollapsibleSection from "./ui/CollapsibleSection.svelte";
  import NumberField from "./ui/NumberField.svelte";
  import MotionSettingsSection from "./settings/MotionSettingsSection.svelte";
  import RobotSettingsSection from "./settings/RobotSettingsSection.svelte";
  import { showToast } from "../toast";
  import { resetSettings } from "../../utils/settingsPersistence";
  import {
    AVAILABLE_FIELD_MAPS,
    DEFAULT_SETTINGS,
    FIELD_SIZE,
  } from "../../config/defaults";
  import type { Settings } from "../../types";

  interface Props {
    isOpen?: boolean;
    settings: Settings;
  }

  let { isOpen = $bindable(false), settings = $bindable() }: Props = $props();

  // Track which sections are collapsed
  let collapsedSections = $state({
    robot: true,
    motion: true,
    advanced: true,
    interface: true,
  });

  // Get version from package. json
  // Display value for angular velocity (user inputs this, gets multiplied by PI)
  let angularVelocityDisplay = $derived(
    settings ? settings.aVelocity / Math.PI : 1,
  );

  function handleAngularVelocityInput(value: string) {
    const parsed = parseFloat(value);
    settings.aVelocity = (Number.isNaN(parsed) ? 0 : parsed) * Math.PI;
  }

  async function handleReset() {
    if (
      confirm(
        "Are you sure you want to reset all settings to defaults? This cannot be undone.",
      )
    ) {
      const defaultSettings = await resetSettings();
      // Reassign (rather than mutate) so the `bind:settings` prop propagates.
      settings = { ...settings, ...defaultSettings };
    }
  }

  // Keys of Settings whose value is a number (optional or not).
  type NumericSettingKey = {
    [K in keyof Settings]-?: NonNullable<Settings[K]> extends number
      ? K
      : never;
  }[keyof Settings];

  // Helper function to handle input with validation
  function handleNumberInput(
    value: string,
    property: NumericSettingKey,
    min?: number,
    max?: number,
  ) {
    let num = parseFloat(value);
    if (isNaN(num)) num = 0;
    if (min !== undefined) num = Math.max(min, num);
    if (max !== undefined) num = Math.min(max, num);
    settings[property] = num;
  }

  // Helper function to convert file to base64
  function imageToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("Failed to convert image"));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Helper function to handle custom field image upload
  async function handleCustomFieldUpload(e: Event) {
    const target = e.target;
    if (target && "files" in target) {
      const fileList = target.files as FileList;
      const file = fileList?.[0];
      if (file) {
        try {
          const base64 = await imageToBase64(file);
          settings.customFieldImage = base64;
        } catch (error) {
          console.error("Failed to load custom field image:", error);
          alert("Failed to load image. Please try a different file.");
        }
      }
    }
  }
</script>

<Modal
  {isOpen}
  titleId="settings-title"
  onClose={() => (isOpen = false)}
  panelClass="console-panel console-flat flex flex-col justify-start items-start p-6 w-full max-w-2xl max-h-[80vh]"
>
  <!-- Header -->
  <div class="flex flex-row justify-between items-center w-full mb-4">
    <h2 id="settings-title" class="text-xl font-semibold text-[#e8e8e8]">
      Settings
    </h2>
    <span class="text-xs text-[#888888] mt-1"> Pedro Pathing Visualizer </span>
    <button
      onclick={() => (isOpen = false)}
      aria-label="Close settings"
      class="console-icon-button"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width={2}
        stroke="currentColor"
        class="size-6 text-[#888888]"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M6 18 18 6M6 6l12 12"
        />
      </svg>
    </button>
  </div>

  <!-- Warning Banner -->
  <div class="console-section w-full mb-4 p-3">
    <div class="flex items-start gap-2">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width={1.5}
        stroke="currentColor"
        class="size-5 text-[#888888] shrink-0 mt-0.5"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
        />
      </svg>
      <div class="text-sm text-[#d0d0d0]">
        <div class="font-medium mb-1">UI Settings Only</div>
        <div class="text-xs opacity-90">
          These settings only affect the visualizer/UI. Ensure your robot code
          matches these values for accurate simulation.
        </div>
      </div>
    </div>
  </div>

  <!-- Settings Content -->
  <div class="w-full flex-1 overflow-y-auto pr-2">
    <!-- Robot Settings Section -->
    <CollapsibleSection
      title="Robot Configuration"
      iconPath="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25Z"
      collapsed={collapsedSections.robot}
      onToggle={() => (collapsedSections.robot = !collapsedSections.robot)}
    >
      <RobotSettingsSection bind:settings />
    </CollapsibleSection>

    <!-- Motion Settings Section -->
    <CollapsibleSection
      title="Motion Parameters"
      iconPath="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
      collapsed={collapsedSections.motion}
      onToggle={() => (collapsedSections.motion = !collapsedSections.motion)}
    >
      <MotionSettingsSection bind:settings />
    </CollapsibleSection>

    <!-- Field Settings Section -->
    <CollapsibleSection
      title="Interface Settings"
      iconPath="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42"
      collapsed={collapsedSections.interface}
      onToggle={() =>
        (collapsedSections.interface = !collapsedSections.interface)}
    >
      <div
        class="mt-2 space-y-3 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg"
      >
        <div>
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={settings.showCurrentTValue}
              class="console-checkbox w-4 h-4 text-blue-500 focus:ring-2 focus:ring-blue-500 cursor-pointer"
            />
            <span
              class="text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Show Current T Value
            </span>
          </label>
          <div class="text-xs text-neutral-500 dark:text-neutral-400 ml-6 mt-1">
            Display the active path t value beside the robot while it is moving
          </div>
        </div>

        <div class="console-section p-3 space-y-3">
          <div
            class="text-sm font-medium text-neutral-700 dark:text-neutral-300"
          >
            Panel Layout
          </div>

          <NumberField
            id="left-panel-width"
            label="Left Panel Width"
            value={settings.leftPanelWidth ??
              DEFAULT_SETTINGS.leftPanelWidth ??
              370}
            min={0}
            step={5}
            suffix="px"
            inputClass="console-input w-28 px-3 py-2"
            onInput={(v) => handleNumberInput(v, "leftPanelWidth", 0)}
          />

          <NumberField
            id="right-panel-width"
            label="Right Panel Width"
            value={settings.rightPanelWidth ??
              DEFAULT_SETTINGS.rightPanelWidth ??
              620}
            min={0}
            step={5}
            suffix="px"
            inputClass="console-input w-28 px-3 py-2"
            onInput={(v) => handleNumberInput(v, "rightPanelWidth", 0)}
          />

          <div>
            <NumberField
              id="left-panel-min-width"
              label="Left Panel Minimum Width"
              value={settings.leftPanelMinWidth ??
                DEFAULT_SETTINGS.leftPanelMinWidth ??
                0}
              min={0}
              step={5}
              suffix="px"
              inputClass="console-input w-28 px-3 py-2"
              onInput={(v) => handleNumberInput(v, "leftPanelMinWidth", 0)}
            />
            <div class="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Prevents the left sidebar from being squished smaller than this.
              Set to 0 for no limit.
            </div>
          </div>

          <div>
            <NumberField
              id="right-panel-min-width"
              label="Right Panel Minimum Width"
              value={settings.rightPanelMinWidth ??
                DEFAULT_SETTINGS.rightPanelMinWidth ??
                0}
              min={0}
              step={5}
              suffix="px"
              inputClass="console-input w-28 px-3 py-2"
              onInput={(v) => handleNumberInput(v, "rightPanelMinWidth", 0)}
            />
            <div class="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Prevents the right sidebar from being squished smaller than this.
              Set to 0 for no limit.
            </div>
          </div>
        </div>

        <!-- Field Map Section -->

        <div>
          <label
            for="field-map-select"
            class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
          >
            Field Map
            <div class="text-xs text-neutral-500 dark:text-neutral-400">
              Select the competition field
            </div>
          </label>
          <select
            id="field-map-select"
            bind:value={settings.fieldMap}
            class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {#each AVAILABLE_FIELD_MAPS as field (field.value)}
              <option value={field.value}>{field.label}</option>
            {/each}
          </select>

          <label
            for="origin-select"
            class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1 mt-4"
          >
            Coordinate Origin
            <div class="text-xs text-neutral-500 dark:text-neutral-400">
              Where (0, 0) sits. The field center makes a rotationally symmetric
              field read symmetrically.
            </div>
          </label>
          <select
            id="origin-select"
            bind:value={settings.origin}
            class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="center"
              >Field center ({FIELD_SIZE / 2}, {FIELD_SIZE / 2})</option
            >
            <option value="bottom-left">Bottom-left corner (0, 0)</option>
          </select>

          <label
            for="axes-select"
            class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1 mt-4"
          >
            Axis Convention
            <div class="text-xs text-neutral-500 dark:text-neutral-400">
              FIRST points +x away from the audience and +y toward the blue
              alliance station. Legacy is rotated a quarter turn from that.
            </div>
          </label>
          <select
            id="axes-select"
            bind:value={settings.axes}
            class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="first">FIRST (+x away from audience)</option>
            <option value="legacy">Legacy (+y away from audience)</option>
          </select>

          <!-- Custom Field Image Upload -->
          {#if settings.fieldMap === "custom"}
            <div
              class="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg"
            >
              <label
                for="custom-field-upload"
                class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
              >
                Upload Custom Field Image
                <div class="text-xs text-neutral-500 dark:text-neutral-400">
                  Accepts PNG, JPG, WEBP (recommended: {FIELD_SIZE}x{FIELD_SIZE}
                  inches aspect ratio)
                </div>
              </label>
              <input
                id="custom-field-upload"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onchange={handleCustomFieldUpload}
                class="w-full text-sm text-neutral-700 dark:text-neutral-300 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-500 file:text-white hover:file:bg-blue-600 file:cursor-pointer"
              />
              {#if settings.customFieldImage}
                <div
                  class="mt-2 flex items-center gap-2 text-sm text-green-600 dark:text-green-400"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width={1.5}
                    stroke="currentColor"
                    class="size-5"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                    />
                  </svg>
                  Custom field image loaded
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    </CollapsibleSection>

    <!-- Advanced Settings Section (for future expansion) -->
    <CollapsibleSection
      title="Advanced Settings"
      iconPath="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z"
      collapsed={collapsedSections.advanced}
      onToggle={() =>
        (collapsedSections.advanced = !collapsedSections.advanced)}
    >
      <div
        class="mt-2 space-y-3 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg"
      >
        <div
          class="p-3 bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700"
        >
          <NumberField
            id="pen-tool-max-paths"
            label="Pen Tool Maximum Paths"
            value={settings.penToolMaxPaths ??
              DEFAULT_SETTINGS.penToolMaxPaths ??
              8}
            min={0}
            max={200}
            step={1}
            onInput={(v) => handleNumberInput(v, "penToolMaxPaths", 0, 200)}
          />
          <div class="mt-2 flex items-center justify-between gap-2">
            <span class="text-xs text-neutral-500 dark:text-neutral-400">
              Maximum number of paths a single pen stroke may create. Set to 0
              for no limit.
            </span>
            <span
              class="text-sm font-medium text-neutral-700 dark:text-neutral-300 min-w-12 text-right"
            >
              {settings.penToolMaxPaths ?? 8}
            </span>
          </div>
        </div>

        <!-- Ghost Paths Toggle -->
        <!-- <div
                class="flex items-center justify-between p-3 bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700"
              >
                <div>
                  <label
                    class="text-sm font-medium text-neutral-700 dark:text-neutral-300 block mb-1"
                  >
                    Collision Overlays
                  </label>
                  <div class="text-xs text-neutral-500 dark:text-neutral-400">
                    Show ghost paths tracing robot body along the path
                  </div>
                </div>
                <input
                  type="checkbox"
                  bind:checked={settings.showGhostPaths}
                  class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-purple-500 focus:ring-2 focus:ring-purple-500 cursor-pointer"
                  title="Enable collision overlay visualization"
                />
              </div> -->

        <!-- Onion Layers Toggle -->
        <div
          class="flex items-center justify-between p-3 bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700"
        >
          <div>
            <div
              class="text-sm font-medium text-neutral-700 dark:text-neutral-300 block mb-1"
            >
              Robot Onion Layers
            </div>
            <div class="text-xs text-neutral-500 dark:text-neutral-400">
              Show robot body at intervals along the path
            </div>
          </div>

          <!-- Main toggle + small next-point-only toggle next to it -->
          <div class="flex items-center gap-3">
            <input
              type="checkbox"
              bind:checked={settings.showOnionLayers}
              class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-indigo-500 focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              title="Enable robot onion layer visualization"
            />

            <label
              class="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400"
            >
              <input
                type="checkbox"
                bind:checked={settings.onionNextPointOnly}
                class="w-4 h-4 rounded border-neutral-300 dark:border-neutral-600 text-indigo-500 focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                title="Limit onion layers to the next point (UI-only for now)"
              />
              <span>Next Point Only</span>
            </label>
          </div>
        </div>

        <!-- Onion Layer Spacing -->
        {#if settings.showOnionLayers}
          <div
            class="p-3 bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700"
          >
            <div
              class="text-sm font-medium text-neutral-700 dark:text-neutral-300 block mb-2"
            >
              Onion Layer Spacing
            </div>
            <div class="flex items-center gap-2">
              <input
                type="range"
                min="2"
                max="20"
                step="1"
                bind:value={settings.onionLayerSpacing}
                class="flex-1 h-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                title="Distance between each robot body trace"
              />
              <span
                class="text-sm font-medium text-neutral-700 dark:text-neutral-300 min-w-12 text-right"
              >
                {settings.onionLayerSpacing || 6}"
              </span>
            </div>
            <div class="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Distance in inches between each robot body trace
            </div>
            <div class="mt-3">
              <label
                for="onion-color"
                class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
              >
                Onion Layer Color
              </label>
              <div class="text-xs text-neutral-500 dark:text-neutral-400 mb-1">
                Color used to draw onion-layer colliders
              </div>
              <div class="flex items-center gap-3">
                <input
                  id="onion-color"
                  type="color"
                  bind:value={settings.onionColor}
                  class="w-10 h-10 p-0 border rounded"
                />
                <input
                  type="text"
                  bind:value={settings.onionColor}
                  class="px-2 py-1 rounded border bg-white dark:bg-neutral-800"
                />
              </div>
            </div>
          </div>
        {/if}

        <!-- Heading Arrow Settings -->
        {#if settings.showHeadingArrow}
          <div
            class="p-3 bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700"
          >
            <div
              class="text-sm font-medium text-neutral-700 dark:text-neutral-300 block mb-3"
            >
              Heading Arrow Settings
            </div>

            <!-- Arrow Length -->
            <div class="mb-3">
              <label
                for="heading-arrow-length"
                class="block text-sm text-neutral-700 dark:text-neutral-300 mb-1"
              >
                Arrow Length
              </label>
              <div class="flex items-center gap-2">
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  id="heading-arrow-length"
                  bind:value={settings.headingArrowLength}
                  class="flex-1 h-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <span
                  class="text-sm font-medium text-neutral-700 dark:text-neutral-300 min-w-12 text-right"
                >
                  {settings.headingArrowLength || 30}px
                </span>
              </div>
            </div>

            <!-- Arrow Color -->
            <div class="mb-3">
              <label
                for="heading-arrow-color"
                class="block text-sm text-neutral-700 dark:text-neutral-300 mb-1"
              >
                Arrow Color
              </label>
              <div class="flex items-center gap-3">
                <input
                  id="heading-arrow-color"
                  type="color"
                  bind:value={settings.headingArrowColor}
                  class="w-10 h-10 p-0 border rounded cursor-pointer"
                />
                <input
                  type="text"
                  bind:value={settings.headingArrowColor}
                  class="px-2 py-1 rounded border bg-white dark:bg-neutral-800 text-sm"
                />
              </div>
            </div>

            <!-- Arrow Thickness -->
            <div>
              <label
                for="heading-arrow-thickness"
                class="block text-sm text-neutral-700 dark:text-neutral-300 mb-1"
              >
                Arrow Thickness
              </label>
              <div class="flex items-center gap-2">
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="0.5"
                  id="heading-arrow-thickness"
                  bind:value={settings.headingArrowThickness}
                  class="flex-1 h-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <span
                  class="text-sm font-medium text-neutral-700 dark:text-neutral-300 min-w-12 text-right"
                >
                  {settings.headingArrowThickness || 3}px
                </span>
              </div>
            </div>
          </div>
        {/if}

        <!-- Debug Arrows Toggle -->
        <!-- Path Opacity Control -->
        <div
          class="p-3 bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700"
        >
          <label
            for="path-opacity"
            class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
          >
            Path Opacity
          </label>
          <div class="flex items-center gap-2">
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              id="path-opacity"
              bind:value={settings.pathOpacity}
              class="flex-1 h-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
            <span
              class="text-sm font-medium text-neutral-700 dark:text-neutral-300 min-w-12 text-right"
            >
              {Math.round((settings.pathOpacity || 1) * 100)}%
            </span>
          </div>
          <div class="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Controls visibility of path lines
          </div>
        </div>

        <!-- Experimental Features -->
        <div
          class="p-3 bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 mt-3"
        >
          <div
            class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
          >
            Experimental Features
          </div>
          <div class="flex flex-col gap-2">
            <label class="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.experimentalFeatures?.optimize ?? false}
                onchange={(e) =>
                  (settings.experimentalFeatures = {
                    ...(settings.experimentalFeatures || {}),
                    optimize: e.currentTarget.checked,
                  })}
                class="h-4 w-4"
              />
              <span class="text-sm">Enable Optimize button</span>
            </label>
            <label class="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.experimentalFeatures?.curveThrough ?? false}
                onchange={(e) =>
                  (settings.experimentalFeatures = {
                    ...(settings.experimentalFeatures || {}),
                    curveThrough: e.currentTarget.checked,
                  })}
                class="h-4 w-4"
              />
              <span class="text-sm">Enable Curve Through features</span>
            </label>
            <label class="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.experimentalFeatures?.obstacles ?? false}
                onchange={(e) =>
                  (settings.experimentalFeatures = {
                    ...(settings.experimentalFeatures || {}),
                    obstacles: e.currentTarget.checked,
                  })}
                class="h-4 w-4"
              />
              <span class="text-sm">Enable Obstacles</span>
            </label>
          </div>
          <div class="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Toggle experimental UI features. Disabled by default.
          </div>
          <div class="text-xs text-red-600 dark:text-red-400 mt-2">
            Disclaimer: Most features labeled "Experimental" are currently
            non-functional and are not recommended for use.
          </div>
        </div>

        <!-- (moved Next-Point Only toggle next to the main onion toggle) -->

        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width={1.5}
          stroke="currentColor"
          class="size-12 mx-auto mb-2 opacity-50"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
          />
        </svg>
        <p class="text-sm">
          More advanced settings will be added here in future updates
        </p>
        <p class="text-xs mt-1">
          Path optimization, collision detection, export options, and so, so
          much more!
        </p>
      </div>
    </CollapsibleSection>
  </div>

  <!-- Footer Buttons -->
  <div
    class="flex justify-between items-center w-full pt-4 mt-4 border-t border-neutral-200 dark:border-neutral-700"
  >
    <button
      onclick={handleReset}
      class="px-4 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors flex items-center gap-2"
      title="Reset all settings to default values"
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
      Reset All
    </button>

    <button
      onclick={() => (isOpen = false)}
      class="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors"
    >
      Close
    </button>
  </div>
</Modal>
