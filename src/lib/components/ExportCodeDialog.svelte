<script lang="ts">
  import { Check, Copy, X } from "@lucide/svelte";
  import type { StartPose, Path, SequenceItem } from "../../types";
  import Modal from "./ui/Modal.svelte";
  import IconButton from "./ui/IconButton.svelte";
  import Button from "./ui/Button.svelte";
  import { checkboxClass, fieldClass, labelClass } from "./ui/styles";
  import { currentFilePath } from "../../stores";
  import {
    generateJavaCode,
    generateKotlinCode,
    generatePointsArray,
    generateSequentialCommandCode,
  } from "../codegen";
  import { highlight, type CodeLanguage } from "../highlight";
  import { pathStem } from "../../utils/filename";

  type Format = "java" | "kotlin" | "points" | "sequential";
  type Mode = "full" | "class" | "coordinates";

  interface Props {
    isOpen?: boolean;
    startPoint: StartPose;
    lines: Path[];
    sequence: SequenceItem[];
  }

  let {
    isOpen = $bindable(false),
    startPoint,
    lines,
    sequence,
  }: Props = $props();

  const TITLES: Record<Format, string> = {
    java: "Java code",
    kotlin: "Kotlin code",
    points: "Points array",
    sequential: "Sequential command",
  };
  const LANGUAGES: Record<Format, CodeLanguage> = {
    java: "java",
    kotlin: "kotlin",
    points: "text",
    sequential: "java",
  };

  let format = $state<Format>("java");
  let mode = $state<Mode>("class");
  let mirror = $state(false);
  let className = $state("AutoPath");
  let code = $state("");
  let html = $state("");
  let copied = $state(false);

  let hasCodeOptions = $derived(format === "java" || format === "kotlin");

  async function generate(): Promise<string> {
    switch (format) {
      case "java":
        return generateJavaCode(startPoint, lines, mode, mirror);
      case "kotlin":
        return generateKotlinCode(startPoint, lines, mode, mirror);
      case "points":
        return generatePointsArray(startPoint, lines);
      case "sequential":
        return generateSequentialCommandCode(
          startPoint,
          lines,
          className,
          sequence,
        );
    }
  }

  // Regenerates whenever the open dialog's options or the project change.
  $effect(() => {
    if (!isOpen) return;
    const language = LANGUAGES[format];
    let stale = false;
    generate()
      .catch((error) => {
        console.error("Export failed:", error);
        return "// Couldn't generate code. The browser console has details.";
      })
      .then(async (generated) => {
        const highlighted = await highlight(generated, language);
        if (stale) return;
        code = generated;
        html = highlighted;
      });
    return () => (stale = true);
  });

  export function openWithFormat(next: Format) {
    format = next;
    if (next === "sequential") {
      className =
        pathStem($currentFilePath).replace(/[^a-zA-Z0-9]/g, "_") || "AutoPath";
    }
    isOpen = true;
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch (error) {
      console.error("Clipboard copy failed:", error);
    }
  }
</script>

<Modal
  {isOpen}
  titleId="export-title"
  onClose={() => (isOpen = false)}
  panelClass="flex max-h-[90vh] w-full max-w-4xl flex-col mx-4"
>
  <div
    class="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3"
  >
    <h2 id="export-title" class="mr-auto text-base font-semibold text-heading">
      {TITLES[format]}
    </h2>
    {#if hasCodeOptions}
      <label class="flex items-center gap-2">
        <span class={labelClass}>Include</span>
        <select class={[fieldClass, "w-auto"]} bind:value={mode}>
          <option value="coordinates">Coordinates only</option>
          <option value="class">Class only</option>
          <option value="full">Full code</option>
        </select>
      </label>
      <label class="flex items-center gap-2 text-sm text-heading">
        <input type="checkbox" class={checkboxClass} bind:checked={mirror} />
        Mirror horizontally
      </label>
    {:else if format === "sequential"}
      <label class="flex items-center gap-2">
        <span class={labelClass}>Class name</span>
        <input
          class={[fieldClass, "w-36"]}
          bind:value={className}
          placeholder="AutoPath"
        />
      </label>
    {/if}
    <IconButton label="Close" onclick={() => (isOpen = false)}><X /></IconButton
    >
  </div>

  <div class="code-export relative min-h-0 flex-1 overflow-auto text-[13px]">
    <!-- Shiki's output, built from generated code with its HTML escaped. -->
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html html}
  </div>

  <div class="flex justify-end border-t border-border px-5 py-3">
    <Button variant="primary" size="sm" onclick={copy} disabled={!code}>
      {#if copied}<Check class="size-4" /> Copied{:else}<Copy class="size-4" /> Copy{/if}
    </Button>
  </div>
</Modal>
