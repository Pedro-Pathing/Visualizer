<script lang="ts">
  import { fieldClass, labelClass } from "./styles";

  interface Props {
    id: string;
    label: string;
    description?: string;
    value: number | undefined;
    min?: number | undefined;
    max?: number | undefined;
    step?: number | string | undefined;
    suffix?: string;
    disabled?: boolean;
    inputClass?: string;
    onInput: (rawValue: string) => void;
  }

  let {
    id,
    label,
    description = "",
    value,
    min = undefined,
    max = undefined,
    step = undefined,
    suffix = "",
    disabled = false,
    inputClass = "",
    onInput,
  }: Props = $props();

  let focused = $state(false);
  let text = $state("");

  // Mirror the prop while the user is not editing. During editing the field
  // owns its text so partial input ("8" on a min-180 field) is not clamped
  // out from under the caret.
  $effect.pre(() => {
    if (!focused) text = value === undefined ? "" : String(value);
  });

  function inRange(n: number): boolean {
    if (Number.isNaN(n)) return false;
    if (min !== undefined && n < min) return false;
    if (max !== undefined && n > max) return false;
    return true;
  }

  function handleInput(event: Event) {
    text = (event.currentTarget as HTMLInputElement).value;
    // Only push through while the typed value is already valid; anything
    // partial waits for blur so it does not get clamped mid-keystroke.
    if (inRange(parseFloat(text))) onInput(text);
  }

  function commit() {
    const parsed = parseFloat(text);
    const fallback = min ?? 0;
    const clamped = Number.isNaN(parsed)
      ? fallback
      : Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed));
    text = String(clamped);
    onInput(text);
  }

  function handleBlur() {
    focused = false;
    commit();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") commit();
  }
</script>

<div class="flex min-w-0 flex-col gap-1">
  <label for={id} class={labelClass}>{label}</label>
  <div class={suffix && "flex items-center gap-2"}>
    <input
      {id}
      type="number"
      value={text}
      {min}
      {max}
      {step}
      {disabled}
      oninput={handleInput}
      onfocus={() => (focused = true)}
      onblur={handleBlur}
      onkeydown={handleKeydown}
      class={[fieldClass, "font-mono", inputClass]}
    />
    {#if suffix}
      <span class="text-xs text-body">{suffix}</span>
    {/if}
  </div>
  {#if description}
    <p class="text-xs text-body">{description}</p>
  {/if}
</div>
