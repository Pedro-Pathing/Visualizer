<script lang="ts">
  import { cubicInOut } from "svelte/easing";
  import { fade, fly } from "svelte/transition";
  import { resetSettings } from "../../utils/settingsPersistence";
  import { AVAILABLE_FIELD_MAPS } from "../../config/defaults";
  import type { Settings } from "../../types";

  export let isOpen = false;
  export let settings: Settings;

  // Track which sections are collapsed
  let collapsedSections = {
    robot: true,
    motion: true,
    advanced: true,
    theme: true,
  };

  // Get version from package. json
  import packageJson from "../../../package.json";
  let appVersion = packageJson.version;

  // Display value for angular velocity (user inputs this, gets multiplied by PI)
  $: angularVelocityDisplay = settings ? settings.aVelocity / Math.PI : 1;

  function handleAngularVelocityInput(e: Event) {
    const target = e.target as HTMLInputElement;
    settings.aVelocity = parseFloat(target.value) * Math.PI;
  }

  async function handleReset() {
    if (
      confirm(
        "Are you sure you want to reset all settings to defaults? This cannot be undone.",
      )
    ) {
      const defaultSettings = await resetSettings();
      // Update the bound settings object
      Object.keys(defaultSettings).forEach((key) => {
        settings[key] = defaultSettings[key];
      });
    }
  }

  // Helper function to handle input with validation
  function handleNumberInput(
    value: string,
    property: keyof Settings,
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
  function imageToBase64(file) {
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
</script>

{#if isOpen}
  <div
    transition:fade={{ duration: 500, easing: cubicInOut }}
    class="bg-black bg-opacity-25 flex flex-col justify-center items-center absolute top-0 left-0 w-full h-full z-[1005]"
    role="dialog"
    aria-modal="true"
    aria-labelledby="settings-title"
  >
    <div
      transition:fly={{ duration: 500, easing: cubicInOut, y: 20 }}
      class="flex flex-col justify-start items-start p-6 bg-white dark:bg-neutral-900 rounded-lg w-full max-w-md max-h-[80vh]"
    >
      <!-- Header -->
      <div class="flex flex-row justify-between items-center w-full mb-4">
        <h2
          id="settings-title"
          class="text-xl font-semibold text-neutral-900 dark:text-white"
        >
          Settings
        </h2>
        <div class="flex items-center gap-2 mt-1">
          <span
            class="text-xs font-medium text-neutral-500 dark:text-neutral-400"
          >
            Version {appVersion}
          </span>
          <div class="text-xs text-neutral-400 dark:text-neutral-500">•</div>
          <span class="text-xs text-neutral-500 dark:text-neutral-400">
            Pedro Pathing Visualizer
          </span>
        </div>
        <button
          on:click={() => (isOpen = false)}
          aria-label="Close settings"
          class="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width={2}
            stroke="currentColor"
            class="size-6 text-neutral-700 dark:text-neutral-400"
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
      <div
        class="w-full mb-4 p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg"
      >
        <div class="flex items-start gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width={1.5}
            stroke="currentColor"
            class="size-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
          <div class="text-sm text-amber-800 dark:text-amber-200">
            <div class="font-medium mb-1">UI Settings Only</div>
            <div class="text-xs opacity-90">
              These settings only affect the visualizer/UI. Ensure your robot
              code matches these values for accurate simulation.
            </div>
          </div>
        </div>
      </div>

      <!-- Settings Content -->
      <div class="w-full flex-1 overflow-y-auto pr-2">
        <!-- Robot Settings Section -->
        <div class="mb-4">
          <button
            on:click={() =>
              (collapsedSections.robot = !collapsedSections.robot)}
            class="flex items-center justify-between w-full py-2 px-3 bg-neutral-100 dark:bg-neutral-800 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
            aria-expanded={!collapsedSections.robot}
          >
            <div class="flex items-center gap-2">
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
                  d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25Z"
                />
              </svg>
              <span class="font-semibold">Robot Configuration</span>
            </div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width={2}
              stroke="currentColor"
              class="size-5 transition-transform duration-200"
              class:rotate-180={collapsedSections.robot}
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="m19.5 8.25-7.5 7.5-7.5-7.5"
              />
            </svg>
          </button>

          {#if !collapsedSections.robot}
            <div
              class="mt-2 space-y-3 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg"
            >
              <div>
                <label
                  for="robot-width"
                  class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                >
                  Robot Width (in)
                  <div class="text-xs text-neutral-500 dark:text-neutral-400">
                    Width of the robot base
                  </div>
                </label>
                <input
                  id="robot-width"
                  type="number"
                  value={settings.rWidth}
                  min="1"
                  max="36"
                  step="0.5"
                  on:input={(e) =>
                    handleNumberInput(e.target.value, "rWidth", 1, 36)}
                  class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label
                  for="robot-height"
                  class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                >
                  Robot Height (in)
                  <div class="text-xs text-neutral-500 dark:text-neutral-400">
                    Height of the robot base
                  </div>
                </label>
                <input
                  id="robot-height"
                  type="number"
                  value={settings.rHeight}
                  min="1"
                  max="36"
                  step="0.5"
                  on:input={(e) =>
                    handleNumberInput(e.target.value, "rHeight", 1, 36)}
                  class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label
                  for="safety-margin"
                  class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                >
                  Safety Margin (in)
                  <div class="text-xs text-neutral-500 dark:text-neutral-400">
                    Buffer around obstacles
                  </div>
                </label>
                <input
                  id="safety-margin"
                  type="number"
                  value={settings.safetyMargin}
                  min="0"
                  max="24"
                  step="0.5"
                  on:input={(e) =>
                    handleNumberInput(e.target.value, "safetyMargin", 0, 24)}
                  class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <!-- Robot Image Upload -->
              <div>
                <div
                  class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                >
                  Robot Image
                  <div class="text-xs text-neutral-500 dark:text-neutral-400">
                    Upload a custom image for your robot
                  </div>
                </div>
                <div
                  class="flex flex-col items-center gap-3 p-4 border border-neutral-300 dark:border-neutral-700 rounded-md bg-neutral-50 dark:bg-neutral-800/50"
                >
                  <!-- Current robot image preview -->
                  <div
                    class="relative w-20 h-20 border-2 border-neutral-300 dark:border-neutral-600 rounded-md overflow-hidden bg-white dark:bg-neutral-900"
                  >
                    <img
                      src={settings.robotImage || "/robot.png"}
                      alt="Robot Preview"
                      class="w-full h-full object-contain"
                      on:error={(e) => {
                        console.error(
                          "Failed to load robot image:",
                          settings.robotImage,
                        );
                        e.target.src = "/robot.png"; // Fallback
                      }}
                    />
                    {#if settings.robotImage && settings.robotImage !== "/robot.png"}
                      <button
                        on:click={() => {
                          settings.robotImage = "/robot.png";
                          settings = { ...settings }; // Force reactivity
                        }}
                        class="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                        title="Remove custom image"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="size-3"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="3"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    {/if}
                  </div>

                  <!-- Image info -->
                  <div
                    class="text-center text-xs text-neutral-600 dark:text-neutral-400"
                  >
                    {#if settings.robotImage && settings.robotImage !== "/robot.png"}
                      <p class="font-medium">
                        {#if settings.robotImage === "/JefferyThePotato.png"}
                          <span class="inline-flex items-center gap-1">
                            <span>🥔</span>
                            <span>Jeffery the Potato Active!</span>
                            <span>🥔</span>
                          </span>
                        {:else}
                          Custom Image Loaded
                        {/if}
                      </p>
                      <p
                        class="truncate max-w-[160px]"
                        title={settings.robotImage.substring(0, 100)}
                      >
                        {#if settings.robotImage === "/JefferyThePotato.png"}
                          Best. Robot. Ever. 🥔
                        {:else}
                          {settings.robotImage.substring(0, 30)}...
                        {/if}
                      </p>
                    {:else}
                      <p>Using default robot image</p>
                    {/if}
                  </div>

                  <!-- Upload button -->
                  <div class="flex flex-col gap-2 w-full">
                    <input
                      id="robot-image-input"
                      type="file"
                      accept="image/*"
                      class="hidden"
                      on:change={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          try {
                            const base64 = await imageToBase64(file);
                            settings.robotImage = base64;
                            settings = { ...settings }; // Force reactivity

                            // Show success message
                            const successMsg = document.createElement("div");
                            successMsg.className =
                              "fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded-md shadow-lg";
                            successMsg.textContent = "Robot image updated!";
                            document.body.appendChild(successMsg);
                            setTimeout(() => successMsg.remove(), 3000);
                          } catch (error) {
                            alert("Error loading image: " + error.message);
                          }
                        }
                      }}
                    />
                    <button
                      on:click={() =>
                        document.getElementById("robot-image-input").click()}
                      class="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors flex items-center justify-center gap-2"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="size-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      Upload Robot Image
                    </button>

                    <button
                      on:click={() => {
                        settings.robotImage = "/robot.png";
                        settings = { ...settings };
                      }}
                      class="px-4 py-2 text-sm bg-neutral-500 hover:bg-neutral-600 text-white rounded-md transition-colors"
                      disabled={!settings.robotImage ||
                        settings.robotImage === "/robot.png"}
                    >
                      Use Default Image
                    </button>

                    <button
                      on:click={() => {
                        settings.robotImage = "/JefferyThePotato.png";
                        settings = { ...settings };
                      }}
                      class="potato-tooltip px-4 py-2 text-sm bg-amber-700 hover:bg-amber-800 text-white rounded-md transition-colors flex items-center justify-center gap-2 group relative overflow-hidden"
                      style="background-image: linear-gradient(45deg, #a16207 25%, #ca8a04 25%, #ca8a04 50%, #a16207 50%, #a16207 75%, #ca8a04 75%, #ca8a04 100%); background-size: 20px 20px;"
                      title="Transform your robot into Jeffery the Potato!"
                    >
                      <!-- Potato emoji with animation -->
                      <span
                        class="text-lg group-hover:scale-110 transition-transform duration-300"
                        >🥔</span
                      >
                      <span class="font-semibold">Use Potato Robot</span>
                      <span class="text-lg opacity-80">🥔</span>

                      <!-- Fun hover effect -->
                      <div
                        class="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-200/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"
                      ></div>
                    </button>
                  </div>

                  <div
                    class="text-xs text-neutral-500 dark:text-neutral-400 text-center mt-1"
                  >
                    <p>Supported: PNG, JPG, GIF</p>
                    <p>Recommended: &lt; 1MB, transparent background</p>
                  </div>
                </div>
              </div>
            </div>
          {/if}
        </div>

        <!-- Motion Settings Section -->
        <div class="mb-4">
          <button
            on:click={() =>
              (collapsedSections.motion = !collapsedSections.motion)}
            class="flex items-center justify-between w-full py-2 px-3 bg-neutral-100 dark:bg-neutral-800 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
            aria-expanded={!collapsedSections.motion}
          >
            <div class="flex items-center gap-2">
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
                  d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
                />
              </svg>
              <span class="font-semibold">Motion Parameters</span>
            </div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width={2}
              stroke="currentColor"
              class="size-5 transition-transform duration-200"
              class:rotate-180={collapsedSections.motion}
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="m19.5 8.25-7.5 7.5-7.5-7.5"
              />
            </svg>
          </button>

          {#if !collapsedSections.motion}
            <div
              class="mt-2 space-y-3 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg"
            >
              <!-- Velocity Settings -->
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label
                    for="x-velocity"
                    class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                  >
                    X Velocity (in/s)
                  </label>
                  <input
                    id="x-velocity"
                    type="number"
                    value={settings.xVelocity}
                    min="0"
                    step="1"
                    on:input={(e) =>
                      handleNumberInput(e.target.value, "xVelocity", 0)}
                    class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label
                    for="y-velocity"
                    class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                  >
                    Y Velocity (in/s)
                  </label>
                  <input
                    id="y-velocity"
                    type="number"
                    value={settings.yVelocity}
                    min="0"
                    step="1"
                    on:input={(e) =>
                      handleNumberInput(e.target.value, "yVelocity", 0)}
                    class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <!-- Angular Velocity -->
              <div>
                <label
                  for="angular-velocity"
                  class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                >
                  Angular Velocity (π rad/s)
                  <div class="text-xs text-neutral-500 dark:text-neutral-400">
                    Multiplier of π radians per second
                  </div>
                </label>
                <input
                  id="angular-velocity"
                  type="number"
                  value={angularVelocityDisplay}
                  min="0"
                  step="0.1"
                  on:input={handleAngularVelocityInput}
                  class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <!-- Velocity Limits -->
              <div>
                <label
                  for="max-velocity"
                  class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                >
                  Max Velocity (in/s)
                </label>
                <input
                  id="max-velocity"
                  type="number"
                  value={settings.maxVelocity}
                  min="0"
                  step="1"
                  on:input={(e) =>
                    handleNumberInput(e.target.value, "maxVelocity", 0)}
                  class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <!-- Acceleration Limits -->
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label
                    for="max-acceleration"
                    class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                  >
                    Max Acceleration (in/s²)
                  </label>
                  <input
                    id="max-acceleration"
                    type="number"
                    value={settings.maxAcceleration}
                    min="0"
                    step="1"
                    on:input={(e) =>
                      handleNumberInput(e.target.value, "maxAcceleration", 0)}
                    class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label
                    for="max-deceleration"
                    class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                  >
                    Max Deceleration (in/s²)
                  </label>
                  <input
                    id="max-deceleration"
                    type="number"
                    value={settings.maxDeceleration || settings.maxAcceleration}
                    min="0"
                    step="1"
                    on:input={(e) =>
                      handleNumberInput(e.target.value, "maxDeceleration", 0)}
                    class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <!-- Friction -->
              <div>
                <label
                  for="friction-coefficient"
                  class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                >
                  Friction Coefficient
                  <div class="text-xs text-neutral-500 dark:text-neutral-400">
                    Higher values = more resistance
                  </div>
                </label>
                <input
                  id="friction-coefficient"
                  type="number"
                  value={settings.kFriction}
                  min="0"
                  step="0.1"
                  on:input={(e) =>
                    handleNumberInput(e.target.value, "kFriction", 0)}
                  class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          {/if}
        </div>

        <!-- Field Settings Section -->
        <div class="mb-4">
          <button
            on:click={() =>
              (collapsedSections.theme = !collapsedSections.theme)}
            class="flex items-center justify-between w-full py-2 px-3 bg-neutral-100 dark:bg-neutral-800 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
            aria-expanded={!collapsedSections.theme}
          >
            <div class="flex items-center gap-2">
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
                  d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42"
                />
              </svg>
              <span class="font-semibold">Interface Settings</span>
            </div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width={2}
              stroke="currentColor"
              class="size-5 transition-transform duration-200"
              class:rotate-180={collapsedSections.theme}
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="m19.5 8.25-7.5 7.5-7.5-7.5"
              />
            </svg>
          </button>

          {#if !collapsedSections.theme}
            <div
              class="mt-2 space-y-3 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg"
            >
              <div>
                <label
                  for="theme-select"
                  class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                >
                  Theme
                  <div class="text-xs text-neutral-500 dark:text-neutral-400">
                    Interface color scheme
                  </div>
                </label>
                <select
                  id="theme-select"
                  bind:value={settings.theme}
                  class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="auto">Auto (System Preference)</option>
                  <option value="light">Light Mode</option>
                  <option value="dark">Dark Mode</option>
                </select>
                <div
                  class="mt-2 text-xs text-neutral-500 dark:text-neutral-400"
                >
                  {#if settings.theme === "auto"}
                    {#if window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches}
                      Currently using: Dark (from system)
                    {:else}
                      Currently using: Light (from system)
                    {/if}
                  {:else}
                    Currently using: {settings.theme}
                  {/if}
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
                  {#each AVAILABLE_FIELD_MAPS as field}
                    <option value={field.value}>{field.label}</option>
                  {/each}
                </select>
              </div>
            </div>
          {/if}
        </div>

        <!-- Advanced Settings Section (for future expansion) -->
        <div class="mb-4">
          <button
            on:click={() =>
              (collapsedSections.advanced = !collapsedSections.advanced)}
            class="flex items-center justify-between w-full py-2 px-3 bg-neutral-100 dark:bg-neutral-800 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
            aria-expanded={!collapsedSections.advanced}
          >
            <div class="flex items-center gap-2">
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
                  d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z"
                />
              </svg>
              <span class="font-semibold">Advanced Settings</span>
            </div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width={2}
              stroke="currentColor"
              class="size-5 transition-transform duration-200"
              class:rotate-180={collapsedSections.advanced}
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="m19.5 8.25-7.5 7.5-7.5-7.5"
              />
            </svg>
          </button>

          {#if !collapsedSections.advanced}
            <div
              class="mt-2 space-y-3 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg"
            >
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

                  <label class="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
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
                      class="text-sm font-medium text-neutral-700 dark:text-neutral-300 min-w-[3rem] text-right"
                    >
                      {settings.onionLayerSpacing || 6}"
                    </span>
                  </div>
                  <div
                    class="text-xs text-neutral-500 dark:text-neutral-400 mt-1"
                  >
                    Distance in inches between each robot body trace
                  </div>
                  <div class="mt-3">
                    <label class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      Onion Layer Color
                      <div class="text-xs text-neutral-500 dark:text-neutral-400">Color used to draw onion-layer colliders</div>
                    </label>
                    <div class="flex items-center gap-3">
                      <input type="color" bind:value={settings.onionColor} class="w-10 h-10 p-0 border rounded" />
                      <input type="text" bind:value={settings.onionColor} class="px-2 py-1 rounded border bg-white dark:bg-neutral-800" />
                    </div>
                  </div>
                </div>
              {/if}

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
                Path optimization, collision detection, export options, and so,
                so much more!
              </p>
            </div>
          {/if}
        </div>
      </div>

      <!-- Footer Buttons -->
      <div
        class="flex justify-between items-center w-full pt-4 mt-4 border-t border-neutral-200 dark:border-neutral-700"
      >
        <button
          on:click={handleReset}
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
          on:click={() => (isOpen = false)}
          class="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .potato-tooltip {
    position: relative;
  }

  .potato-tooltip::after {
    content: "🥔 P O T A T O   P O W E R 🥔";
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%) translateY(-10px);
    background: linear-gradient(to right, #a16207, #ca8a04, #a16207);
    color: white;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 10px;
    font-weight: bold;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition:
      opacity 0.3s,
      transform 0.3s;
    z-index: 1000;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    border: 2px solid #92400e;
  }

  .potato-tooltip:hover::after {
    opacity: 1;
    transform: translateX(-50%) translateY(-5px);
  }
</style>
