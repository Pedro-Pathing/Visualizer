import Two from "two.js";
import type { Path as TwoPath } from "two.js/src/path";
import type { Line as PathLine } from "two.js/src/shapes/line";
import type { AtomicPath, BasePoint, Settings } from "../../types";
import { getCurvePoint, quadraticToCubic } from "../../utils/math";
import {
  CURVE_SAMPLES,
  flattenToAtomicSegments,
  lineCurvePoints,
} from "../../utils/pathTraversal";
import type { PointContainer, PointRegistry } from "../canvas/pointRefs";
import { LINE_WIDTH } from "../../config/defaults";
import type { PathRenderSpec, SceneScales } from "./types";

export function buildSegmentPath(
  startPoint: BasePoint,
  line: AtomicPath,
  { x, y }: SceneScales,
): TwoPath | PathLine {
  if (line.throughPoints?.length) {
    const points = lineCurvePoints(startPoint, line);
    const anchors = points.map(
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
    anchors.forEach((anchor) => (anchor.relative = false));
    const elem = new Two.Path(anchors);
    elem.automatic = false;
    return elem;
  }

  if (line.controlPoints.length > 2) {
    // Approximate an n-degree bezier curve by sampling it
    const cps = [startPoint, ...line.controlPoints, line.endPoint];
    const anchors = [
      new Two.Anchor(
        x(startPoint.x),
        y(startPoint.y),
        0,
        0,
        0,
        0,
        Two.Commands.move,
      ),
    ];
    for (let i = 1; i <= CURVE_SAMPLES; ++i) {
      const point = getCurvePoint(i / CURVE_SAMPLES, cps);
      anchors.push(
        new Two.Anchor(x(point.x), y(point.y), 0, 0, 0, 0, Two.Commands.line),
      );
    }
    anchors.forEach((anchor) => (anchor.relative = false));
    const elem = new Two.Path(anchors);
    elem.automatic = false;
    return elem;
  }

  if (line.controlPoints.length > 0) {
    const cp1 = line.controlPoints[1]
      ? line.controlPoints[0]
      : quadraticToCubic(startPoint, line.controlPoints[0], line.endPoint).Q1;
    const cp2 =
      line.controlPoints[1] ??
      quadraticToCubic(startPoint, line.controlPoints[0], line.endPoint).Q2;
    const anchors = [
      new Two.Anchor(
        x(startPoint.x),
        y(startPoint.y),
        x(startPoint.x),
        y(startPoint.y),
        x(cp1.x),
        y(cp1.y),
        Two.Commands.move,
      ),
      new Two.Anchor(
        x(line.endPoint.x),
        y(line.endPoint.y),
        x(cp2.x),
        y(cp2.y),
        x(line.endPoint.x),
        y(line.endPoint.y),
        Two.Commands.curve,
      ),
    ];
    anchors.forEach((anchor) => (anchor.relative = false));
    const elem = new Two.Path(anchors);
    elem.automatic = false;
    return elem;
  }

  return new Two.Line(
    x(startPoint.x),
    y(startPoint.y),
    x(line.endPoint.x),
    y(line.endPoint.y),
  );
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
