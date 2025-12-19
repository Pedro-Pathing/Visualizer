// Map playbar percent (including waits) to robotPercent and wait state
export function getRobotPercentAndWait(playbarPercent: number, lines: any[]): { robotPercent: number, isWaiting: boolean, waitLineIdx: number|null } {
  // playbarPercent: 0-100 (total time, including waits)
  // Returns: { robotPercent: 0-100, isWaiting: boolean, waitLineIdx: number|null }
  const totalWait = lines.reduce((sum, line) => sum + (line.waitTime || 0), 0);
  const baseMovementMs = (100 * lines.length) / 0.065;
  const totalTimeMs = baseMovementMs + (totalWait * 1000);
  const playbarMs = (playbarPercent / 100) * totalTimeMs;
  let timeSoFar = 0;
  let robotPercent = 0;
  // For each line, accumulate movement and wait
  for (let i = 0; i < lines.length; i++) {
    const moveMs = baseMovementMs / lines.length;
    if (timeSoFar + moveMs > playbarMs) {
      // We're in the movement part of this line
      const moveFrac = (playbarMs - timeSoFar) / moveMs;
      robotPercent = ((i + moveFrac) / lines.length) * 100;
      return { robotPercent, isWaiting: false, waitLineIdx: null };
    }
    timeSoFar += moveMs;
    // After movement, check wait
    const waitSec = lines[i].waitTime || 0;
    const waitMs = waitSec * 1000;
    if (waitMs > 0) {
      if (timeSoFar + waitMs > playbarMs) {
        // We're in the wait for this line
        robotPercent = ((i + 1) / lines.length) * 100;
        return { robotPercent, isWaiting: true, waitLineIdx: i };
      }
      timeSoFar += waitMs;
    }
  }
  // If we get here, we're at the end
  return { robotPercent: 100, isWaiting: false, waitLineIdx: null };
}
export * from "./draw";
export * from "./math";

export const DPI = 96 / 5;

export const titleCase = (str: string) =>
  `${str[0].toUpperCase()}${str.slice(1).toLowerCase()}`;
