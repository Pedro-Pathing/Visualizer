<script lang="ts">
  import { LoaderCircle, WandSparkles } from "@lucide/svelte";
  import { useEditor } from "../../state/editor.svelte";
  import IconButton from "./ui/IconButton.svelte";

  /** The one optimize button: used for a single path and for all paths. */
  interface Props {
    label: string;
    onclick: () => void;
    size?: "sm" | "md";
    disabled?: boolean;
  }

  let { label, onclick, size = "md", disabled = false }: Props = $props();

  const editor = useEditor();
</script>

<IconButton
  label={editor.optimizing ? "Optimizing…" : label}
  {size}
  disabled={disabled || editor.optimizing}
  aria-busy={editor.optimizing || undefined}
  {onclick}
>
  {#if editor.optimizing}
    <LoaderCircle class="animate-spin" />
  {:else}
    <WandSparkles />
  {/if}
</IconButton>
