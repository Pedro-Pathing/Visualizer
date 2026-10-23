<script lang="ts">
  import { dialogRequest, type DialogRequest } from "../../dialog";
  import Button from "./Button.svelte";
  import Modal from "./Modal.svelte";
  import { fieldClass } from "./styles";

  let value = $state("");
  let shown = $state<DialogRequest | null>(null);

  // Each request starts from its own value; `shown` outlives the store so
  // the close transition still has content to draw.
  $effect(() => {
    const request = $dialogRequest;
    if (!request) return;
    shown = request;
    value = request.kind === "prompt" ? request.value : "";
  });

  let problem = $derived(
    shown?.kind === "prompt"
      ? value.trim()
        ? (shown.validate?.(value.trim()) ?? null)
        : "Enter a name."
      : null,
  );

  function finish(confirmed: boolean) {
    const request = $dialogRequest;
    if (!request) return;
    dialogRequest.set(null);
    if (request.kind === "confirm") request.resolve(confirmed);
    else request.resolve(confirmed ? value.trim() : null);
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!problem) finish(true);
  }

  function focus(node: HTMLInputElement) {
    node.focus();
    node.select();
  }
</script>

<Modal
  isOpen={$dialogRequest !== null}
  titleId="dialog-title"
  panelClass="w-full max-w-sm mx-4 p-5"
  onClose={() => finish(false)}
>
  {#if shown}
    <form class="flex flex-col gap-4" onsubmit={submit}>
      <div class="flex flex-col gap-1">
        <h2 id="dialog-title" class="text-base font-semibold text-heading">
          {shown.title}
        </h2>
        {#if shown.message}
          <p class="text-sm text-body">{shown.message}</p>
        {/if}
      </div>

      {#if shown.kind === "prompt"}
        <div class="flex flex-col gap-1">
          <input
            use:focus
            class={fieldClass}
            bind:value
            placeholder={shown.placeholder}
            aria-label={shown.title}
            aria-invalid={problem !== null}
          />
          <p
            class={[
              "text-xs",
              value.trim() && problem ? "text-danger" : "text-body",
            ]}
          >
            {value.trim() && problem ? problem : (shown.hint ?? " ")}
          </p>
        </div>
      {/if}

      <div class="flex justify-end gap-2">
        <Button variant="ghost" onclick={() => finish(false)}>Cancel</Button>
        <Button
          type="submit"
          variant={shown.kind === "confirm" && shown.danger
            ? "danger"
            : "primary"}
          disabled={problem !== null}
        >
          {shown.confirmLabel ?? "OK"}
        </Button>
      </div>
    </form>
  {/if}
</Modal>
