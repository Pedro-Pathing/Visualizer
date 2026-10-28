import { beforeEach, vi } from "vitest";

// Ids and colors for paths a file doesn't name come from Math.random and
// Date.now, so both are pinned to keep golden output stable.
beforeEach(() => {
  let seed = 1;
  vi.spyOn(Math, "random").mockImplementation(() => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  });
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-01-01T00:00:00Z") });
});
