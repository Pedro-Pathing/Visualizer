<script lang="ts">
  import Modal from "./ui/Modal.svelte";
  import Button from "./ui/Button.svelte";

  interface Props {
    isOpen?: boolean;
    /** Between 0 and 1. */
    progress?: number;
    statusMessage?: string;
    onCancel?: () => void;
  }

  let {
    isOpen = false,
    progress = 0,
    statusMessage = "Processing...",
    onCancel = () => {},
  }: Props = $props();

  let percent = $derived(Math.round(progress * 100));
</script>

<Modal
  {isOpen}
  titleId="progress-title"
  closeOnEscape={false}
  closeOnBackdrop={false}
  panelClass="w-full max-w-sm mx-4 p-5"
>
  <div class="flex flex-col gap-4">
    <h2 id="progress-title" class="text-base font-semibold text-heading">
      Exporting GIF
    </h2>

    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between text-sm">
        <span class="text-body">{statusMessage}</span>
        <span class="font-mono text-heading tabular-nums">{percent}%</span>
      </div>
      <div
        class="h-2 overflow-hidden rounded-full bg-body/20"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div
          class="h-full rounded-full bg-primary transition-[width] duration-300"
          style={`width: ${percent}%`}
        ></div>
      </div>
    </div>

    <div class="flex justify-end">
      <Button variant="ghost" onclick={onCancel}>Cancel</Button>
    </div>
  </div>
</Modal>
