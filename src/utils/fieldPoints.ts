import type { FieldPoint } from "../types";

export type { FieldPoint } from "../types";

export function renderFieldPoints(
  canvas: HTMLCanvasElement | null | undefined,
  points: FieldPoint[],
  xScale: (value: number) => number,
  yScale: (value: number) => number,
  width: number,
  height: number,
  defaultRadius = 2.2,
  defaultColor = "rgba(34, 197, 94, 0.9)",
): void {
  if (!canvas || width <= 0 || height <= 0) return;

  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const pixelWidth = Math.max(1, Math.round(width * dpr));
  const pixelHeight = Math.max(1, Math.round(height * dpr));

  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (points.length === 0) return;

  const buckets = new Map<
    string,
    { color: string; radius: number; opacity: number; points: FieldPoint[] }
  >();

  for (const point of points) {
    const color = point.color || defaultColor;
    const radius = Math.max(0.6, point.radius ?? defaultRadius);
    const opacity = Math.max(0, Math.min(1, point.opacity ?? 1));
    const key = `${color}|${radius}|${opacity}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { color, radius, opacity, points: [] };
      buckets.set(key, bucket);
    }
    bucket.points.push(point);
  }

  ctx.save();
  for (const bucket of buckets.values()) {
    ctx.fillStyle = bucket.color;
    ctx.globalAlpha = bucket.opacity;
    ctx.beginPath();
    for (const point of bucket.points) {
      const px = xScale(point.x);
      const py = yScale(point.y);
      ctx.moveTo(px + bucket.radius, py);
      ctx.arc(px, py, bucket.radius, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.restore();
}
