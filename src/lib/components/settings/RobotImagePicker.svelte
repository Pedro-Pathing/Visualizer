<script lang="ts">
  import { Upload, X } from "@lucide/svelte";
  import type { Settings } from "../../../types";
  import { imageToBase64 } from "../../../utils/file";
  import { showToast } from "../../toast";
  import Button from "../ui/Button.svelte";
  import { labelClass } from "../ui/styles";

  interface Props {
    settings: Settings;
  }

  let { settings = $bindable() }: Props = $props();

  const DEFAULT_ROBOT_IMAGE = "/robot.png";
  const POTATO_IMAGE = "/JefferyThePotato.png";
  const DUCK_IMAGE = "/MecanumDuck.png";

  const presets = [
    {
      src: DEFAULT_ROBOT_IMAGE,
      label: "Default",
      hint: "Use the default robot image",
    },
    {
      src: POTATO_IMAGE,
      label: "🥔 Potato",
      hint: "Transform your robot into Jeffery the Potato!",
    },
    {
      src: DUCK_IMAGE,
      label: "Duck",
      hint: "Use the Mecanum Duck robot image",
    },
  ];

  let fileInput: HTMLInputElement | undefined = $state();

  // Narrowed value so the template can use it without optional checks.
  let customImage = $derived(
    settings.robotImage && settings.robotImage !== DEFAULT_ROBOT_IMAGE
      ? settings.robotImage
      : null,
  );
  let isCustom = $derived(customImage !== null);
  let currentImage = $derived(settings.robotImage || DEFAULT_ROBOT_IMAGE);

  function setImage(src: string) {
    settings.robotImage = src;
    settings = { ...settings }; // Force reactivity
  }

  async function handleUpload(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const base64 = await imageToBase64(file);
      settings.robotImage = base64;
      // Automatically enable heading arrow when custom robot image is uploaded
      settings.showHeadingArrow = true;
      settings = { ...settings };
      showToast("Robot image updated!", "success");
    } catch (error) {
      showToast(
        `Error loading image: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    }
  }
</script>

<div class="flex flex-col gap-2">
  <span class={labelClass}>Image</span>

  <div class="flex items-center gap-3">
    <div
      class="relative size-16 shrink-0 overflow-hidden rounded-lg border border-border bg-base"
    >
      <img
        src={currentImage}
        alt="Robot preview"
        class="size-full object-contain"
        onerror={(e) => {
          console.error("Failed to load robot image:", settings.robotImage);
          (e.currentTarget as HTMLImageElement).src = DEFAULT_ROBOT_IMAGE;
        }}
      />
      {#if isCustom}
        <button
          type="button"
          class="absolute top-0.5 right-0.5 inline-flex size-5 items-center justify-center rounded-md border border-border bg-surface text-body transition hover:text-danger"
          title="Remove custom image"
          aria-label="Remove custom image"
          onclick={() => setImage(DEFAULT_ROBOT_IMAGE)}
        >
          <X class="size-3" />
        </button>
      {/if}
    </div>

    <div class="min-w-0 text-xs">
      {#if customImage === POTATO_IMAGE}
        <p class="font-medium text-heading">Jeffery the Potato Active!</p>
        <p class="text-body">Best. Robot. Ever. 🥔</p>
      {:else if customImage === DUCK_IMAGE}
        <p class="font-medium text-heading">Mecanum Duck Active!</p>
        <p class="text-body">Quack Quack</p>
      {:else if customImage}
        <p class="font-medium text-heading">Custom image loaded</p>
        <p
          class="truncate font-mono text-body"
          title={customImage.substring(0, 100)}
        >
          {customImage.substring(0, 30)}...
        </p>
      {:else}
        <p class="text-body">Using the default robot image</p>
      {/if}
    </div>
  </div>

  <div class="grid grid-cols-3 gap-1">
    {#each presets as preset (preset.src)}
      <Button
        size="sm"
        title={preset.hint}
        aria-pressed={currentImage === preset.src}
        class={[
          "min-w-0",
          currentImage === preset.src && "border-primary! text-primary!",
        ]}
        onclick={() => setImage(preset.src)}
      >
        {preset.label}
      </Button>
    {/each}
  </div>

  <input
    bind:this={fileInput}
    type="file"
    accept="image/*"
    class="hidden"
    onchange={handleUpload}
  />
  <Button size="sm" onclick={() => fileInput?.click()}>
    <Upload class="size-3.5" /> Upload image
  </Button>
  <p class="text-xs text-body">
    PNG, JPG or GIF. Under 1 MB with a transparent background works best.
  </p>
</div>
