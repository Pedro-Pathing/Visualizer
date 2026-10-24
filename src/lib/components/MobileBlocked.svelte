<script lang="ts">
  import { Monitor } from "@lucide/svelte";
</script>

<main class="flex min-h-screen items-center justify-center p-6 text-center">
  <div
    class="flex w-full max-w-md flex-col items-center gap-5 rounded-3xl border border-border bg-base/70 p-8 shadow-sm"
  >
    <Monitor class="size-12 text-primary/60" />
    <h1 class="text-3xl font-bold text-heading">Computer required</h1>
    <p class="max-w-[36ch] text-body">
      The visualizer needs a mouse, a keyboard and a large screen. Please open
      it on a desktop or laptop computer to continue.
    </p>
  </div>
</main>
