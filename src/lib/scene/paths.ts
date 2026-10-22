import Two from "two.js";
import type { Path as TwoPath } from "two.js/src/path";
import type { Line as PathLine } from "two.js/src/shapes/line";
import type { AtomicPath, BasePoint, Settings } from "../../types";
import { curveOf } from "../../model/curve";
import { flattenToAtomicSegments } from "../../utils/pathTraversal";
import type { PointContainer, PointRegistry } from "../canvas/pointRefs";
import { LINE_WIDTH } from "../../config/defaults";
import { segmentStroke } from "./stroke";
import type { PathRenderSpec, SceneScales } from "./types";

export function buildSegmentPath(
  startPoint: BasePoint,
  line: AtomicPath,
  { x, y }: SceneScales,
): TwoPath | PathLine {
  const stroke = segmentStroke(curveOf(startPoint, line));
  let anchors: InstanceType<typeof Two.Anchor>[];

  switch (stroke.kind) {
    case "line":
      return new Two.Line(
        x(stroke.from.x),
        y(stroke.from.y),
        x(stroke.to.x),
        y(stroke.to.y),
      );
    case "cubic":
      anchors = [
        new Two.Anchor(
          x(stroke.from.x),
          y(stroke.from.y),
          x(stroke.from.x),
          y(stroke.from.y),
          x(stroke.control1.x),
          y(stroke.control1.y),
          Two.Commands.move,
        ),
        new Two.Anchor(
          x(stroke.to.x),
          y(stroke.to.y),
          x(stroke.control2.x),
          y(stroke.control2.y),
          x(stroke.to.x),
          y(stroke.to.y),
          Two.Commands.curve,
        ),
      ];
      break;
    case "polyline":
      anchors = stroke.points.map(
        (point, index) =>
          new Two.Anchor(
            x(point.x),
            y(point.y),
            0,
            0,
            0,
            0,
            index === 0 ? Two.Commands.move : Two.Commands.line,
          ),
      );
      break;
  }

  anchors.forEach((anchor) => (anchor.relative = false));
  const elem = new Two.Path(anchors);
  elem.automatic = false;
  return elem;
}

export function buildPathElements(
  spec: PathRenderSpec,
  scales: SceneScales,
  settings: Settings,
  registry?: PointRegistry,
  container: PointContainer = "main",
): (TwoPath | PathLine)[] {
  const { startPoint, lines, idPrefix, color, honorLocked = true } = spec;
  const opacityScale = spec.opacityScale ?? 1;
  const baseOpacity = (settings.pathOpacity || 1.0) * opacityScale;
  const elements: (TwoPath | PathLine)[] = [];

  flattenToAtomicSegments(startPoint, lines).forEach(
    ({ line, index: idx, start: segmentStart }) => {
      const lineElem = buildSegmentPath(segmentStart, line, scales);

      lineElem.id = `${idPrefix}-${idx + 1}`;
      registry?.registerSegment(lineElem.id, line.id, container);
      lineElem.stroke = color || line.color;
      lineElem.linewidth = scales.x(LINE_WIDTH);
      lineElem.noFill();

      if (honorLocked && line.locked) {
        lineElem.dashes = [scales.x(2), scales.x(2)];
        lineElem.opacity = baseOpacity * 0.7;
      } else {
        if (honorLocked) lineElem.dashes = [];
        lineElem.opacity = baseOpacity;
      }

      elements.push(lineElem);
    },
  );

  return elements;
}
