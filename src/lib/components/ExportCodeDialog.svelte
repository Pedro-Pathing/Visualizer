<script lang="ts">
  import { run } from "svelte/legacy";

  import type { StartPose, Path, SequenceItem } from "../../types";
  import Highlight from "svelte-highlight";
  import { java, kotlin, plaintext } from "svelte-highlight/languages";
  import codeStyle from "svelte-highlight/styles/androidstudio";
  import Modal from "./ui/Modal.svelte";
  import { currentFilePath, fieldFrame } from "../../stores";
  import {
    generateCode,
    generatePointsArray,
    generateSequentialCommandCode,
  } from "../codegen";
  import { basename } from "../../utils/filename";

  type ExportFormat = "java" | "kotlin" | "points" | "sequential";

  const HIGHLIGHT = {
    java,
    kotlin,
    points: plaintext,
    sequential: java,
  } as const;

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

  let exportMode: "full" | "class" | "coordinates" = $state("class");
  let exportFormat: ExportFormat = $state("java");
  let sequentialClassName = $state("AutoPath");
  let mirrorHorizontally = $state(false);
  let exportedCode = $state("");
  let currentLanguage: typeof java | typeof kotlin | typeof plaintext =
    $state(java);
  let copied = $state(false);

  let originLabel = $derived(
    $fieldFrame.center.x === 0 && $fieldFrame.center.y === 0
      ? "bottom-left"
      : "field-center",
  );
  let axesLabel = $derived($fieldFrame.axes === "first" ? "FIRST" : "legacy PedroPathing");

  // Update sequential class name when file changes
  run(() => {
    if ($currentFilePath) {
      const fileName = basename($currentFilePath);
      if (fileName) {
        const baseName = fileName
          .replace(".pp", "")
          .replace(/[^a-zA-Z0-9]/g, "_");
        if (
          sequentialClassName === "AutoPath" ||
          sequentialClassName === baseName
        ) {
          sequentialClassName = baseName;
        }
      }
    }
  });

  export async function openWithFormat(format: ExportFormat) {
    exportFormat = format;

    try {
      if (format === "sequential") {
        // Initialize the editable class name from the current file path
        // so the user sees the file-derived class name, but keep the
        // field editable for manual overrides.
        if ($currentFilePath) {
          const fileName = basename($currentFilePath);
          if (fileName) {
            sequentialClassName = fileName
              .replace(".pp", "")
              .replace(/[^a-zA-Z0-9]/g, "_");
          }
        }
      }
      exportedCode = await renderExport(format);
      currentLanguage = HIGHLIGHT[format];
      isOpen = true;
    } catch (error) {
      console.error("Export failed:", error);
      exportedCode =
        "// Error generating code. Please check the console for details.";
      currentLanguage = plaintext;
      isOpen = true;
    }
  }

  function renderExport(format: ExportFormat): Promise<string> | string {
    const input = { startPoint, lines, frame: $fieldFrame };
    switch (format) {
      case "points":
        return generatePointsArray(startPoint, lines, $fieldFrame);
      case "sequential":
        return generateSequentialCommandCode({
          ...input,
          className: sequentialClassName,
          sequence,
        });
      default:
        return generateCode(format, {
          ...input,
          exportMode,
          mirrorHorizontally,
        });
    }
  }

  /** Re-render in place after a control that changes the emitted source. */
  async function refreshExport(formats: ExportFormat[]) {
    if (!isOpen || !formats.includes(exportFormat)) return;
    try {
      exportedCode = await renderExport(exportFormat);
    } catch (error) {
      console.error("Refresh failed:", error);
      exportedCode =
        "// Error refreshing code. Please check the console for details.";
    }
  }

  const refreshSequentialCode = () => refreshExport(["sequential"]);
  const handleExportModeChange = () => refreshExport(["java", "kotlin"]);
  const handleMirrorChange = () => refreshExport(["java", "kotlin"]);
</script>

<svelte:head>
  <!-- codeStyle is a static stylesheet imported from svelte-highlight, not user input. -->
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html codeStyle}
</svelte:head>

<Modal
  {isOpen}
  onClose={() => (isOpen = false)}
  panelClass="console-panel console-flat flex flex-col justify-start items-start p-4 w-full max-w-4xl gap-2.5 max-h-[90vh]"
>
  <div class="flex flex-row justify-between items-center w-full">
    <p class="text-sm font-light text-neutral-700 dark:text-neutral-400">
      {#if exportFormat === "java"}
        Here is the generated Java code for this path:
      {:else if exportFormat === "kotlin"}
        Here is the generated Kotlin code for this path:
      {:else if exportFormat === "points"}
        Here is the points array for this path:
      {:else if exportFormat === "sequential"}
        Here is the Sequential Command code for this path:
      {/if}
    </p>
    <div class="flex items-center gap-2">
      {#if exportFormat === "java" || exportFormat === "kotlin"}
        <label
          for="export-mode"
          class="text-sm font-light text-neutral-700 dark:text-neutral-400"
          >Export Mode:</label
        >
        <select
          id="export-mode"
          bind:value={exportMode}
          onchange={handleExportModeChange}
          class="px-2 py-1 text-sm rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          <option value="coordinates">Coordinates Only</option>
          <option value="class">Class Only</option>
          <option value="full">Full Code</option>
        </select>
        {#if exportFormat === "kotlin" || exportFormat === "java"}
          <label
            for="mirror-horizontal"
            class="text-sm font-light text-neutral-700 dark:text-neutral-400 ml-2 flex items-center gap-2"
          >
            <input
              id="mirror-horizontal"
              type="checkbox"
              bind:checked={mirrorHorizontally}
              onchange={handleMirrorChange}
              class="cursor-pointer"
            />
            Mirror Horizontally
          </label>
        {/if}
      {:else if exportFormat === "sequential"}
        <div class="flex items-center gap-2">
          <label
            for="class-name"
            class="text-sm font-light text-neutral-700 dark:text-neutral-400"
            >Class Name:</label
          >
          <input
            id="class-name"
            type="text"
            bind:value={sequentialClassName}
            oninput={refreshSequentialCode}
            class="px-2 py-1 text-sm rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 w-32"
            placeholder="AutoPath"
          />
        </div>
      {/if}
      <button onclick={() => (isOpen = false)} aria-label="Close export dialog">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
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
  </div>

  <p
    class="w-full rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-light text-neutral-700 dark:text-neutral-300"
  >
    This project uses a <strong class="font-medium">{originLabel}</strong>
    origin and <strong class="font-medium">{axesLabel}</strong> axes. Make sure every
    pose in your code follows the same conventions.
  </p>

  <div class="relative w-full flex-1 overflow-auto">
    <Highlight language={currentLanguage} code={exportedCode} class="w-full" />
    <button
      title={copied ? "Copied" : "Copy code to clipboard"}
      onclick={async () => {
        try {
          await navigator.clipboard.writeText(exportedCode || "");
          copied = true;
          setTimeout(() => (copied = false), 1500);
        } catch (err) {
          console.error("Clipboard copy failed:", err);
        }
      }}
      class="absolute bottom-2 right-2 opacity-45 hover:opacity-100 transition-all duration-200 bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-800 p-2 rounded"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        class="size-5"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5A3.375 3.375 0 0 0 6.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0 0 15 2.25h-1.5a2.251 2.251 0 0 0-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v12c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 0 0-9-9Z"
        />
      </svg>
    </button>
  </div>
</Modal>
