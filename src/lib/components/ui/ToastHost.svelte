<script lang="ts">
  import { fly } from "svelte/transition";
  import {
    CircleAlert,
    CircleCheck,
    Info,
    TriangleAlert,
  } from "@lucide/svelte";
  import { toasts, type ToastType } from "../../toast";

  const ICONS: Record<ToastType, typeof Info> = {
    success: CircleCheck,
    error: CircleAlert,
    warning: TriangleAlert,
    info: Info,
  };

  const ICON_CLASSES: Record<ToastType, string> = {
    success: "text-success",
    error: "text-danger",
    warning: "text-warning",
    info: "text-primary",
  };
</script>

<div
  class="fixed right-4 bottom-4 z-3000 flex flex-col items-end gap-2"
  aria-live="polite"
>
  {#each $toasts as toast (toast.id)}
    {@const Icon = ICONS[toast.type]}
    <div
      transition:fly={{ duration: 200, y: 8 }}
      class="flex max-w-sm items-start gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-heading shadow-lg"
      role="status"
    >
      <Icon class="mt-0.5 size-4 shrink-0 {ICON_CLASSES[toast.type]}" />
      <span>{toast.message}</span>
    </div>
  {/each}
</div>
