import type { TimePrediction } from "../../types";

/**
 * When "onion layers for the next point only" is enabled, narrow the layers to
 * the travel segment the playhead is currently in, or the next one upcoming.
 */
export function selectVisibleOnionLayers<T extends { lineId?: string }>(
  layers: T[],
  prediction: TimePrediction | null | undefined,
  percent: number,
  nextPointOnly: boolean | undefined,
): T[] {
  if (!nextPointOnly || !prediction || !prediction.timeline) return layers;

  const currentTime = (prediction.totalTime || 0) * (percent / 100);
  const travelEvents = (prediction.timeline || []).filter(
    (ev) => ev.type === "travel",
  );

  let selectedLineId: string | null = null;

  const currentTravel = travelEvents.find(
    (ev) => ev.startTime <= currentTime && ev.endTime >= currentTime,
  );
  if (currentTravel) {
    selectedLineId = currentTravel.lineId ?? null;
  } else {
    const nextTravel = travelEvents.find((ev) => ev.startTime > currentTime);
    if (nextTravel) selectedLineId = nextTravel.lineId ?? null;
    else if (travelEvents.length)
      selectedLineId = travelEvents[travelEvents.length - 1].lineId ?? null;
  }

  if (selectedLineId === null) return layers;
  return layers.filter((layer) => layer.lineId === selectedLineId);
}
