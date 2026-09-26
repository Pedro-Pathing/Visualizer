import { PEDRO_API } from "./pedroApi";
import type { LanguageSpec } from "./languages/spec";
import type {
  ExportMode,
  ExportModel,
  HeadingCall,
  InterpolatorRef,
  PathDecl,
  PathExpr,
  PiecewiseNode,
} from "./types";

function interpolatorExpression(node: PiecewiseNode): string {
  const base = interpolatorBase(node.interpolator);
  return node.reversed ? PEDRO_API.interpolator.reverse(base) : base;
}

function interpolatorBase(ref: InterpolatorRef): string {
  switch (ref.kind) {
    case "constant":
      return PEDRO_API.interpolator.constant(ref.poseVar);
    case "linear":
      return PEDRO_API.interpolator.linear(ref.startPoseVar, ref.endPoseVar);
    case "tangent":
      return PEDRO_API.interpolator.tangent();
    case "facingPoint":
      return PEDRO_API.interpolator.facingPoint(ref.poseVar);
  }
}

function headingSuffix(heading: HeadingCall, spec: LanguageSpec): string {
  switch (heading.kind) {
    case "constant":
      return PEDRO_API.heading.constant(heading.poseVar);
    case "linear":
      return PEDRO_API.heading.linear(heading.startPoseVar, heading.endPoseVar);
    case "tangential":
      return heading.reversed
        ? PEDRO_API.heading.tangentialReversed()
        : PEDRO_API.heading.tangentialForward();
    case "facingPoint":
      return PEDRO_API.heading.facingPoint(heading.poseVar);
    case "piecewise": {
      const chain = heading.nodes.reduce(
        (expression, node) =>
          expression +
          PEDRO_API.interpolator.until(
            spec.numberLiteral(node.untilT),
            interpolatorExpression(node),
          ),
        PEDRO_API.interpolator.piecewise(),
      );
      return PEDRO_API.heading.piecewise(chain);
    }
    case "unsupported":
      // The TODO comment on the method carries the explanation. A path with no
      // interpolator throws when followed, so fall back to a tangent heading.
      return PEDRO_API.heading.tangentialForward();
  }
}

function expressionOf(expr: PathExpr, spec: LanguageSpec): string {
  const base =
    expr.kind === "group"
      ? PEDRO_API.paths.group(
          expr.children.map((child) => expressionOf(child, spec)),
        )
      : expr.throughPoseVars.length > 0
        ? PEDRO_API.paths.through([
            expr.startPoseVar,
            ...expr.throughPoseVars,
            expr.endPoseVar,
          ])
        : expr.controlPoseVars.length === 0
        ? PEDRO_API.paths.line(expr.startPoseVar, expr.endPoseVar)
        : PEDRO_API.paths.curve(
            expr.startPoseVar,
            expr.controlPoseVars,
            expr.endPoseVar,
          );

  return expr.heading ? `${base}${headingSuffix(expr.heading, spec)}` : base;
}

export function pathExpression(path: PathDecl, spec: LanguageSpec): string {
  return expressionOf(path.expression, spec);
}

export function emitPoseFields(model: ExportModel, spec: LanguageSpec): string {
  const out: string[] = [];
  out.push(
    spec.poseFactoryField(
      PEDRO_API.poseFactory(model.options.mirrorHorizontally),
    ),
  );
  out.push("");
  model.poses.forEach((pose) => {
    const args = PEDRO_API.pose(
      spec.numberLiteral(pose.x),
      spec.numberLiteral(pose.y),
      spec.numberLiteral(pose.headingDeg),
    );
    out.push(spec.poseField(pose.varName, args));
  });
  return out.join("\n");
}

export function emitPathMethods(
  model: ExportModel,
  spec: LanguageSpec,
): string {
  return model.paths
    .map((path) => {
      const method = spec.pathMethod(
        path.methodName,
        pathExpression(path, spec),
      );
      return path.note ? `    ${spec.comment(path.note)}\n${method}` : method;
    })
    .join("\n\n");
}

function emitSequence(model: ExportModel): string {
  const follower = "follower";
  return model.sequence
    .map((step) => {
      switch (step.kind) {
        case "path":
          return `            ${PEDRO_API.commands.follow(follower, step.methodName)}`;
        case "wait":
          return `            ${PEDRO_API.commands.wait(step.durationMs)}`;
        case "command":
          return `            ${step.expression}`;
      }
    })
    .join(",\n");
}

function emitRunOpModeBody(model: ExportModel, spec: LanguageSpec): string {
  const t = spec.terminator;
  return `        Scheduler.reset()${t}
        follower = Constants.create(hardwareMap)${t}
        follower.setPose(${model.startPoseVar})${t}
        follower.update()${t}

        waitForStart()${t}
        schedule(autoRoutine())${t}

        while (opModeIsActive()) {
            follower.update()${t}
            Scheduler.execute()${t}

            telemetry.addData("x", follower.pose().x())${t}
            telemetry.addData("y", follower.pose().y())${t}
            telemetry.addData("heading", follower.pose().heading())${t}

            if (follower.currentPath() != null) {
                telemetry.addData("Current path distance remaining", follower.distanceToEndpoint())${t}
                telemetry.addData("Path number", follower.pathIndex())${t}
            }

            telemetry.update()${t}
        }`;
}

function emitWarnings(model: ExportModel, spec: LanguageSpec): string {
  if (model.warnings.length === 0) return "";
  const lines = [
    spec.comment("Generated with unresolved heading settings:"),
    ...model.warnings.map((warning) => spec.comment(`  - ${warning}`)),
  ];
  return `${lines.join("\n")}\n\n`;
}

export function emitSource(
  model: ExportModel,
  spec: LanguageSpec,
  mode: ExportMode,
): string {
  const fields = emitPoseFields(model, spec);
  const methods = emitPathMethods(model, spec);

  if (mode === "coordinates") {
    return `${emitWarnings(model, spec)}${fields}\n\n${methods}`;
  }

  if (mode === "class") {
    return `${emitWarnings(model, spec)}${spec.imports("paths", { interpolator: model.usesInterpolator })}

${spec.classOpen("Paths", "paths")}

${fields}

${methods}
}`;
  }

  return `${spec.packageStatement(model.options.packageName)}

${spec.imports("opmode", { interpolator: model.usesInterpolator })}

${emitWarnings(model, spec)}${spec.classOpen(model.options.className, "opmode")}

${spec.followerField()}

${fields}

    ${spec.comment("Autonomous routine")}
${spec.autoRoutineMethod(emitSequence(model))}

${spec.runOpModeMethod(emitRunOpModeBody(model, spec))}

${methods}
}
`;
}
