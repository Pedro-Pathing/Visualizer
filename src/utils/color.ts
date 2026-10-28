/**
 * Path colors that read on every field image. Pink is left out because the
 * selection highlight uses it.
 */
export const PATH_COLORS = [
  "#4e79a7",
  "#f28e2b",
  "#59a14f",
  "#edc948",
  "#76b7b2",
  "#b07aa1",
  "#9c755f",
  "#e15759",
];

export function getRandomColor() {
  return PATH_COLORS[Math.floor(Math.random() * PATH_COLORS.length)];
}
