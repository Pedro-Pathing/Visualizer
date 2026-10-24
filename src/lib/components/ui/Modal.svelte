<script lang="ts">
  import { cubicInOut } from "svelte/easing";
  import { fade, fly } from "svelte/transition";

  interface Props {
    isOpen?: boolean;
    titleId?: string;
    panelClass?: string;
    closeOnEscape?: boolean;
    closeOnBackdrop?: boolean;
    onClose?: () => void;
    children?: import("svelte").Snippet;
  }

  let {
    isOpen = false,
    titleId = "",
    panelClass = "w-full max-w-md mx-4 p-6",
    closeOnEscape = true,
    closeOnBackdrop = true,
    onClose = () => {},
    children,
  }: Props = $props();

  const BACKDROP_MS = 200;
  const PANEL_MS = 300;

  function handleKeydown(event: KeyboardEvent) {
    if (closeOnEscape && event.key === "Escape") {
      event.stopPropagation();
      onClose();
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if (closeOnBackdrop && event.target === event.currentTarget) {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={isOpen ? handleKeydown : undefined} />

{#if isOpen}
  <!-- Backdrop is presentational; Escape is handled on window above. -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    transition:fade={{ duration: BACKDROP_MS, easing: cubicInOut }}
    class="fixed inset-0 z-2000 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    onclick={handleBackdropClick}
  >
    <div
      transition:fly={{ duration: PANEL_MS, easing: cubicInOut, y: -20 }}
      class={[
        "rounded-2xl border border-border bg-surface text-body shadow-xl",
        panelClass,
      ]}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId || undefined}
      tabindex="-1"
    >
      {@render children?.()}
    </div>
  </div>
{/if}
