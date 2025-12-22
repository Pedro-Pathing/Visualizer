<script lang="ts">
  import type { Point, Line, SequenceItem } from "../../types";
  import Highlight from "svelte-highlight";
  import { java } from "svelte-highlight/languages";
  import plaintext from "svelte-highlight/languages/plaintext";
  import codeStyle from "svelte-highlight/styles/androidstudio";
  import { cubicInOut } from "svelte/easing";
  import { fade, fly } from "svelte/transition";
  import { currentFilePath } from "../../stores";
  import {
    generateJavaCode,
    generatePointsArray,
    generateSequentialCommandCode,
  } from "../../utils";

  export let isOpen = false;
  export let startPoint: Point;
  export let lines: Line[];
  export let sequence: SequenceItem[];

  let exportFullCode = false;
  let exportFormat: "java" | "points" | "sequential" = "java";
  let sequentialClassName = "AutoPath";
  let exportedCode = "";
  let currentLanguage: typeof java | typeof plaintext = java;
  let copied = false;

  // Update sequential class name when file changes
  $: if ($currentFilePath) {
    const fileName = $currentFilePath.split(/[\\/]/).pop();
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

  export async function openWithFormat(
    format: "java" | "points" | "sequential",
  ) {
    exportFormat = format;

    try {
      if (format === "java") {
        exportedCode = await generateJavaCode(
          startPoint,
          lines,
          exportFullCode,
        );
        currentLanguage = java;
      } else if (format === "points") {
        exportedCode = generatePointsArray(startPoint, lines);
        currentLanguage = plaintext;
      } else if (format === "sequential") {
        // Initialize the editable class name from the current file path
        // so the user sees the file-derived class name, but keep the
        // field editable for manual overrides.
        if ($currentFilePath) {
          const fileName = $currentFilePath.split(/[\\/]/).pop();
          if (fileName) {
            sequentialClassName = fileName
              .replace(".pp", "")
              .replace(/[^a-zA-Z0-9]/g, "_");
          }
        }
        exportedCode = await generateSequentialCommandCode(
          startPoint,
          lines,
          sequentialClassName,
          sequence,
        );
        currentLanguage = java;
      }
      isOpen = true;
    } catch (error) {
      console.error("Export failed:", error);
      exportedCode =
        "// Error generating code. Please check the console for details.";
      currentLanguage = plaintext;
      isOpen = true;
    }
  }

  async function refreshSequentialCode() {
    if (exportFormat === "sequential" && isOpen) {
      try {
        // Use the user-editable `sequentialClassName` so manual edits are respected
        exportedCode = await generateSequentialCommandCode(
          startPoint,
          lines,
          sequentialClassName,
          sequence,
        );
      } catch (error) {
        console.error("Refresh failed:", error);
        exportedCode =
          "// Error refreshing code. Please check the console for details.";
      }
    }
  }

  async function handleExportFullCodeChange() {
    if (exportFormat === "java") {
      exportedCode = await generateJavaCode(startPoint, lines, exportFullCode);
    }
  }
</script>

<svelte:head>
  {@html codeStyle}
</svelte:head>

{#if isOpen}
  <div
    transition:fade={{ duration: 500, easing: cubicInOut }}
    class="bg-black bg-opacity-25 flex flex-col justify-center items-center absolute top-0 left-0 w-full h-full z-[1005]"
    role="dialog"
    aria-modal="true"
    aria-label="Export code dialog"
    tabindex="-1"
  >
    <div
      transition:fly={{ duration: 500, easing: cubicInOut, y: 20 }}
      class="flex flex-col justify-start items-start p-4 bg-white dark:bg-neutral-900 rounded-lg w-full max-w-4xl gap-2.5 max-h-[90vh]"
      tabindex="-1"
      role="document"
    >
      <div class="flex flex-row justify-between items-center w-full">
        <p class="text-sm font-light text-neutral-700 dark:text-neutral-400">
          {#if exportFormat === "java"}
            Here is the generated Java code for this path:
          {:else if exportFormat === "points"}
            Here is the points array for this path:
          {:else if exportFormat === "sequential"}
            Here is the Sequential Command code for this path:
          {/if}
        </p>
        <div class="flex items-center gap-2">
          {#if exportFormat === "java"}
            <label
              for="export-full-code"
              class="text-sm font-light text-neutral-700 dark:text-neutral-400"
              >Export Full Code</label
            >
            <input
              id="export-full-code"
              type="checkbox"
              bind:checked={exportFullCode}
              on:change={handleExportFullCodeChange}
              class="cursor-pointer"
            />
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
                on:input={refreshSequentialCode}
                class="px-2 py-1 text-sm rounded-md bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 w-32"
                placeholder="AutoPath"
              />
            </div>
          {/if}
          <button
            on:click={() => (isOpen = false)}
            aria-label="Close export dialog"
          >
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

      <div class="relative w-full flex-1 overflow-auto">
        <Highlight
          language={currentLanguage}
          code={exportedCode}
          class="w-full"
        />
        <button
          title={copied ? "Copied" : "Copy code to clipboard"}
          on:click={async () => {
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
    </div>
  </div>
{/if}
