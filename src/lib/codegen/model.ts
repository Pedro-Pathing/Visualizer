import type {
  AtomicPath,
  BasePoint,
  Path,
  SequenceItem,
  StartPose,
} from "../../types";
import {
  atomicSegments,
  getPointAndTangentAtProgress,
  lineCurvePoints,
} from "../../utils/pathTraversal";
import { headingAngleAt } from "../../utils/headingInterpolation";
import {
  LEGACY_FRAME,
  headingToDocFrame,
  toDocFrame,
  type Frame,
} from "../../utils/frame";
import { headingCall } from "./heading";
import { IdentifierAllocator, toClassName } from "./identifiers";
import { PEDRO_API } from "./pedroApi";
import type {
  ExportModel,
  ExportOptions,
  PathDecl,
  PathExpr,
  PoseDecl,
  SequenceStep,
} from "./types";

export interface BuildModelInput {
  startPoint: StartPose;
  lines: Path[];
  sequence?: SequenceItem[];
  mirrorHorizontally?: boolean;
  className?: string | null;
  packageName?: string;
  frame?: Frame;
}

const DEFAULT_PACKAGE = "org.firstinspires.ftc.teamcode";

export function lineId(line: AtomicPath, index: number): string {
  return line.id || `line-${index + 1}`;
}

export function buildExportModel(input: BuildModelInput): ExportModel {
  const { startPoint } = input;
  const lines = atomicSegments(input.lines);

  const frame = input.frame ?? LEGACY_FRAME;
  const options: ExportOptions = {
    mirrorHorizontally: !!input.mirrorHorizontally,
    className: toClassName(input.className, "AutoPath"),
    packageName: input.packageName || DEFAULT_PACKAGE,
    frame,
  };

  const poseNames = new IdentifierAllocator([PEDRO_API.factoryVar]);
  const methodNames = new IdentifierAllocator();

  const poses: PoseDecl[] = [];
  const paths: PathDecl[] = [];
  const warnings: string[] = [];
  let usesInterpolator = false;

  const startPoseVar = poseNames.allocate(startPoint.name, "start");
  poses.push({
    varName: startPoseVar,
    x: startPoint.x,
    y: startPoint.y,
    headingDeg: startPoint.headingDeg,
  });

  let previous = {
    varName: startPoseVar,
    x: startPoint.x,
    y: startPoint.y,
    headingDeg: startPoint.headingDeg,
  };

  const methodNameByLineId = new Map<string, string>();
  let segmentNumber = 0;
  let groupNumber = 0;

  function definePose(
    nameHint: string,
    x: number,
    y: number,
    headingDeg: number,
  ): string {
    const varName = poseNames.allocateExact(nameHint);
    poses.push({ varName, x, y, headingDeg });
    return varName;
  }

  function buildSegment(
    line: AtomicPath,
    label: string,
    notes: string[],
    /** True when an enclosing group supplies the heading instead. */
    overridden: boolean,
  ): PathExpr {
    const endPoint = line.endPoint;
    segmentNumber += 1;
    const endPoseVar = poseNames.allocate(line.name, `point${segmentNumber}`);
    const curvePoints = lineCurvePoints({ x: previous.x, y: previous.y }, line);
    const endHeadingDeg = headingAngleAt(line.heading, "end", {
      ...getPointAndTangentAtProgress(curvePoints, 1),
      curvePoints,
    });

    let segmentStartPoseVar = previous.varName;
    if (!overridden && line.heading.type === "linear") {
      const startHeadingDeg = headingAngleAt(line.heading, "start");
      if (startHeadingDeg !== previous.headingDeg) {
        segmentStartPoseVar = poseNames.allocateExact(`${endPoseVar}Start`);
        poses.push({
          varName: segmentStartPoseVar,
          x: previous.x,
          y: previous.y,
          headingDeg: startHeadingDeg,
        });
      }
    }

    poses.push({
      varName: endPoseVar,
      x: endPoint.x,
      y: endPoint.y,
      headingDeg: endHeadingDeg,
    });

    const controlPoseVars = line.controlPoints.map((controlPoint, cpIndex) => {
      const varName = poseNames.allocateExact(
        `${endPoseVar}Control${cpIndex + 1}`,
      );
      poses.push({
        varName,
        x: controlPoint.x,
        y: controlPoint.y,
        headingDeg: 0,
      });
      return varName;
    });

    // A group's interpolator replaces its children's, so emitting the child's
    // own heading here would be dead weight the reader has to discount.
    const heading = overridden
      ? null
      : resolveHeading(line.heading, {
          startPoseVar: segmentStartPoseVar,
          endPoseVar,
          endX: endPoint.x,
          endY: endPoint.y,
          curvePoints,
          label,
          notes,
        });

    previous = {
      varName: endPoseVar,
      x: endPoint.x,
      y: endPoint.y,
      headingDeg: endHeadingDeg,
    };

    return {
      kind: "segment",
      startPoseVar: segmentStartPoseVar,
      controlPoseVars,
      endPoseVar,
      heading,
    };
  }

  function resolveHeading(
    source: AtomicPath["heading"],
    ctx: {
      startPoseVar: string;
      endPoseVar: string;
      endX: number;
      endY: number;
      curvePoints?: BasePoint[];
      label: string;
      notes: string[];
    },
  ) {
    const heading = headingCall(source, {
      startPoseVar: ctx.startPoseVar,
      endPoseVar: ctx.endPoseVar,
      endX: ctx.endX,
      endY: ctx.endY,
      curvePoints: ctx.curvePoints,
      definePose,
      warn(message) {
        ctx.notes.push(message);
        warnings.push(`${ctx.label}: ${message}`);
      },
    });

    if (heading.kind === "unsupported") {
      ctx.notes.unshift(heading.reason);
      warnings.push(`${ctx.label}: ${heading.reason}`);
    }
    if (heading.kind === "piecewise") usesInterpolator = true;
    return heading;
  }

  function buildNode(
    node: Path,
    label: string,
    notes: string[],
    overridden: boolean,
  ): PathExpr {
    if (node.kind !== "compound") {
      return buildSegment(node, label, notes, overridden);
    }

    groupNumber += 1;
    const groupLabel = node.name || `group${groupNumber}`;
    const overridesChildren = Boolean(node.heading) && !overridden;
    const groupStart = previous;

    const children = node.segments.map((child) =>
      buildNode(child, label, notes, overridden || Boolean(node.heading)),
    );

    let heading = null;
    if (overridesChildren && node.heading) {
      // The group's interpolator spans the whole group, so its poses sit at
      // the group's own ends rather than any child's.
      heading = resolveHeading(node.heading, {
        startPoseVar: definePose(
          `${groupLabel}Start`,
          groupStart.x,
          groupStart.y,
          headingAngleAt(node.heading, "start"),
        ),
        endPoseVar: definePose(
          `${groupLabel}End`,
          previous.x,
          previous.y,
          headingAngleAt(node.heading, "end"),
        ),
        endX: previous.x,
        endY: previous.y,
        label,
        notes,
      });
    }

    return { kind: "group", children, heading };
  }

  input.lines.forEach((node, index) => {
    const methodName = methodNames.allocate(node.name, `path${index + 1}`);
    const notes: string[] = [];
    const expression = buildNode(node, methodName, notes, false);

    // Every segment the method drives maps to it, so a sequence written in
    // terms of segments still resolves once groups exist.
    for (const segment of atomicSegments([node])) {
      methodNameByLineId.set(segment.id, methodName);
    }

    paths.push({
      methodName,
      expression,
      note: notes.length ? `TODO: ${notes.join("; ")}` : undefined,
    });
  });

  return {
    options,
    startPoseVar,
    // Every pose the export can reference lands in this array, so converting
    // here covers the whole emitted model.
    poses: poses.map((pose) => ({
      ...pose,
      ...toDocFrame({ x: pose.x, y: pose.y }, frame),
      headingDeg: headingToDocFrame(pose.headingDeg, frame),
    })),
    paths,
    sequence: buildSequence(lines, paths, methodNameByLineId, input.sequence),
    warnings,
    usesInterpolator,
  };
}

function buildSequence(
  lines: AtomicPath[],
  paths: PathDecl[],
  methodNameByLineId: Map<string, string>,
  sequence: SequenceItem[] | undefined,
): SequenceStep[] {
  // Fall back to running every path in declaration order.
  const allPaths = (): SequenceStep[] =>
    paths.map((path) => ({
      kind: "path" as const,
      methodName: path.methodName,
    }));

  if (!sequence || sequence.length === 0) return allPaths();

  const steps: SequenceStep[] = [];
  let previousMethod: string | null = null;

  sequence.forEach((item) => {
    if (item.kind === "wait") {
      steps.push({ kind: "wait", durationMs: item.durationMs });
      previousMethod = null;
      return;
    }
    const methodName = methodNameByLineId.get(item.lineId);
    if (!methodName) return;
    // A group is one path, so its segments appearing in a row become one call.
    if (methodName === previousMethod) return;
    steps.push({ kind: "path", methodName });
    previousMethod = methodName;
  });

  if (steps.length === 0 && lines.length > 0) return allPaths();
  return steps;
}
