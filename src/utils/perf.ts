/**
 * Lightweight, dependency-free performance instrumentation.
 *
 * These helpers let us see *where* the app is spending time without a profiler.
 * Each sampler aggregates call count + timing and logs a concise summary every
 * `reportIntervalMs`, so it won't spam the console. Off unless
 * `localStorage.perfMonitor` is "1".
 */

let enabled: boolean | null = null;
export function perfEnabled(): boolean {
  if (enabled !== null) return enabled;
  try {
    enabled =
      typeof localStorage !== "undefined" &&
      localStorage.getItem("perfMonitor") === "1";
  } catch {
    enabled = false;
  }
  return enabled;
}

export type PerfSampler = {
  /** Record a sample measured with performance.now(). Pass the start timestamp. */
  sample(start: number): void;
};

export function createPerfSampler(
  tag: string,
  reportIntervalMs = 2000,
): PerfSampler {
  let count = 0;
  let totalMs = 0;
  let maxMs = 0;
  let lastReport = 0;

  function maybeReport(now: number) {
    if (now - lastReport < reportIntervalMs) return;
    const avg = count > 0 ? totalMs / count : 0;

    console.log(
      `[perf:${tag}] ${count} samples | avg ${avg.toFixed(2)}ms | max ${maxMs.toFixed(2)}ms | total ${totalMs.toFixed(1)}ms`,
    );
    count = 0;
    totalMs = 0;
    maxMs = 0;
    lastReport = now;
  }

  return {
    sample(start: number) {
      if (!perfEnabled()) return;
      const now = performance.now();
      const ms = now - start;
      count += 1;
      totalMs += ms;
      if (ms > maxMs) maxMs = ms;
      maybeReport(now);
    },
  };
}

/** Track DOM node counts over time so an unbounded scene (a memory leak) is obvious. */
const nodeSampleAccum = 0;
let lastNodeLog = 0;
export function sampleNodeCounts(
  label: string,
  root: ParentNode | null | undefined,
): void {
  if (!perfEnabled()) return;
  const now = performance.now();
  if (now - lastNodeLog < 5000) return;
  lastNodeLog = now;
  let nodes = 0;
  try {
    if (root) nodes = root.querySelectorAll("*").length;
  } catch {
    nodes = -1;
  }

  console.log(`[perf:${label}] DOM nodes under root: ${nodes}`);
}
