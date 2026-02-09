import prettier from "prettier";
import type { Point, Line, BasePoint } from "../types";
import { getCurvePoint } from "./math";

// Lazy-load Prettier's Java plugin; fall back gracefully if unavailable
let cachedJavaPlugin: any | null = null;
async function loadJavaPlugin() {
  if (cachedJavaPlugin !== null) return cachedJavaPlugin;
  const candidates = ["prettier/plugins/java.js", "prettier/plugins/java"];
  for (const path of candidates) {
    try {
      const mod = await import(path);
      cachedJavaPlugin = (mod as any).default ?? mod;
      return cachedJavaPlugin;
    } catch (err) {
      // ignore and try next
    }
  }
  cachedJavaPlugin = null;
  return null;
}

/**
 * Generate Java code from path data
 */
export async function generateJavaCode(
  startPoint: Point,
  lines: Line[],
  exportMode: "full" | "class" | "coordinates" = "class",
): Promise<string> {
  const headingTypeToFunctionName = {
    constant: "setConstantHeadingInterpolation",
    linear: "setLinearHeadingInterpolation",
    tangential: "setTangentHeadingInterpolation",
  };

  // Generate field declarations with proper indentation
  const fieldDeclarations = lines
    .map((line, idx) => {
      const variableName = line.name
        ? line.name.replace(/[^a-zA-Z0-9]/g, "")
        : `line${idx + 1}`;
      // declare waits as doubles, paths as PathChain
      return (line as any).waitMs !== undefined
        ? `public double ${variableName};`
        : `public PathChain ${variableName};`;
    })
    .join("\n    ");

  // Generate path assignments with proper indentation
  const pathAssignments = lines
    .map((line, idx) => {
      const variableName = line.name
        ? line.name.replace(/[^a-zA-Z0-9]/g, "")
        : `line${idx + 1}`;

      if ((line as any).waitMs !== undefined) {
        // assign wait duration (ms) to double
        return `${variableName} = ${Number((line as any).waitMs)};`;
      }

      const start =
        idx === 0
          ? `new Pose(${startPoint.x.toFixed(3)}, ${startPoint.y.toFixed(3)})`
          : `new Pose(${lines[idx - 1].endPoint.x.toFixed(3)}, ${lines[idx - 1].endPoint.y.toFixed(3)})`;

      const controlPoints = line.controlPoints
        .map(
          (point) =>
            `new Pose(${point.x.toFixed(3)}, ${point.y.toFixed(3)})`,
        )
        .join(",\n            ");

      const curveType =
        line.controlPoints.length === 0 ? `BezierLine` : `BezierCurve`;

      const allPoints = controlPoints
        ? `${start},\n            ${controlPoints},\n            new Pose(${line.endPoint.x.toFixed(3)}, ${line.endPoint.y.toFixed(3)})`
        : `${start},\n            new Pose(${line.endPoint.x.toFixed(3)}, ${line.endPoint.y.toFixed(3)})`;

      const headingConfig =
        line.endPoint.heading === "constant"
          ? `Math.toRadians(${line.endPoint.degrees})`
          : line.endPoint.heading === "linear"
            ? `Math.toRadians(${line.endPoint.startDeg}), Math.toRadians(${line.endPoint.endDeg})`
            : "";

      const reverseConfig = line.endPoint.reverse
        ? "\n          .setReversed(true)"
        : "";

      return `${variableName} = follower.pathBuilder()
          .addPath(
            new ${curveType}(
              ${allPoints}
            )
          )
          .${headingTypeToFunctionName[line.endPoint.heading]}(${headingConfig})${reverseConfig}
          .build();`;
    })
    .join("\n\n      ");

  // If coordinates-only mode, return just the path assignments
  if (exportMode === "coordinates") {
    return pathAssignments;
  }

  const pathsClass = `public static class Paths {
    ${fieldDeclarations}

    public Paths(Follower follower) {
      ${pathAssignments}
    }
  }`;

  let file = "";
  if (exportMode === "class") {
    file = pathsClass;
  } else {
    file = `package org.firstinspires.ftc.teamcode;
import com.qualcomm.robotcore.eventloop.opmode.OpMode;
import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.bylazar.configurables.annotations.Configurable;
import com.bylazar.telemetry.TelemetryManager;
import com.bylazar.telemetry.PanelsTelemetry;
import org.firstinspires.ftc.teamcode.pedroPathing.Constants;
import com.pedropathing.geometry.BezierCurve;
import com.pedropathing.geometry.BezierLine;
import com.pedropathing.follower.Follower;
import com.pedropathing.paths.PathChain;
import com.pedropathing.geometry.Pose;

@Autonomous(name = "Pedro Pathing Autonomous", group = "Autonomous")
@Configurable // Panels
public class PedroAutonomous extends OpMode {
  private TelemetryManager panelsTelemetry; // Panels Telemetry instance
  public Follower follower; // Pedro Pathing follower instance
  private int pathState; // Current autonomous path state (state machine)
  private Paths paths; // Paths defined in the Paths class

  @Override
  public void init() {
    panelsTelemetry = PanelsTelemetry.INSTANCE.getTelemetry();

    follower = Constants.createFollower(hardwareMap);
    follower.setStartingPose(new Pose(72, 8, Math.toRadians(90)));

    paths = new Paths(follower); // Build paths

    panelsTelemetry.debug("Status", "Initialized");
    panelsTelemetry.update(telemetry);
  }

  @Override
  public void loop() {
    follower.update(); // Update Pedro Pathing
    pathState = autonomousPathUpdate(); // Update autonomous state machine

    // Log values to Panels and Driver Station
    panelsTelemetry.debug("Path State", pathState);
    panelsTelemetry.debug("X", follower.getPose().getX());
    panelsTelemetry.debug("Y", follower.getPose().getY());
    panelsTelemetry.debug("Heading", follower.getPose().getHeading());
    panelsTelemetry.update(telemetry);
  }

  ${pathsClass}

  public int autonomousPathUpdate() {
    // Add your state machine Here
    // Access paths with paths.pathName
    // Refer to the Pedro Pathing Docs (Auto Example) for an example state machine
    return 0;
  }
}`;
  }

  try {
    const javaPlugin = await loadJavaPlugin();
    const formattedCode = await prettier.format(file, {
      parser: "java",
      plugins: javaPlugin ? [javaPlugin] : [],
    });
    return formattedCode;
  } catch (error) {
    console.error("Code formatting error:", error);
    return file;
  }
}

/**
 * Generate an array of waypoints (not sampled points) along the path
 */
export function generatePointsArray(startPoint: Point, lines: Line[]): string {
  const points: BasePoint[] = [];

  // Add start point
  points.push(startPoint);

  // Add all waypoints (end points and control points)
  lines.forEach((line) => {
    // Add control points for this line
    line.controlPoints.forEach((controlPoint) => {
      points.push(controlPoint);
    });

    // Add end point of this line
    points.push(line.endPoint);
  });

  // Format as string array, removing decimal places for whole numbers
  const pointsString = points
    .map((point) => {
      const x = Number.isInteger(point.x)
        ? point.x.toFixed(1)
        : point.x.toFixed(3);
      const y = Number.isInteger(point.y)
        ? point.y.toFixed(1)
        : point.y.toFixed(3);
      return `(${x}, ${y})`;
    })
    .join(", ");

  return `[${pointsString}]`;
}

/**
 * Generate Sequential Command code
 */
export async function generateSequentialCommandCode(
  startPoint: Point,
  lines: Line[],
  fileName: string | null = null,
  sequence?: SequenceItem[],
): Promise<string> {
  // Determine class name from file name or use default
  let className = "AutoPath";
  if (fileName) {
    const baseName = fileName.split(/[\\/]/).pop() || "";
    className = baseName.replace(".pp", "").replace(/[^a-zA-Z0-9]/g, "_");
    if (!className) className = "AutoPath";
  }

  // Collect all pose names including control points
  const allPoseDeclarations: string[] = [];
  const allPoseInitializations: string[] = [];

  // Track all pose variable names
  const poseVariableNames: Map<string, string> = new Map();

  // Add start point
  allPoseDeclarations.push("  private Pose startPoint;");
  poseVariableNames.set("startPoint", "startPoint");
  allPoseInitializations.push('    startPoint = pp.get("startPoint");');

  // Process each line
  lines.forEach((line, lineIdx) => {
    const endPointName = line.name
      ? line.name.replace(/[^a-zA-Z0-9]/g, "")
      : `point${lineIdx + 1}`;

    // Add end point declaration
    allPoseDeclarations.push(`  private Pose ${endPointName};`);
    poseVariableNames.set(`point${lineIdx + 1}`, endPointName);
    allPoseInitializations.push(
      `    ${endPointName} = pp.get(\"${endPointName}\");`,
    );

    // Add control points if they exist
    if (line.controlPoints && line.controlPoints.length > 0) {
      line.controlPoints.forEach((_, controlIdx) => {
        const controlPointName = `${endPointName}_control${controlIdx + 1}`;
        allPoseDeclarations.push(`  private Pose ${controlPointName};`);
        allPoseInitializations.push(
          `    ${controlPointName} = pp.get(\"${controlPointName}\");`,
        );
        // Store for use in path building
        poseVariableNames.set(
          `${endPointName}_control${controlIdx + 1}`,
          controlPointName,
        );
      });
    }
  });

  // Generate path chain declarations
  const pathChainDeclarations = lines
    .map((_, idx) => {
      const startPoseName =
        idx === 0
          ? "startPoint"
          : lines[idx - 1]?.name
            ? lines[idx - 1]!.name!.replace(/[^a-zA-Z0-9]/g, "")
            : `point${idx}`;
      const endPoseName = lines[idx].name
        ? lines[idx].name.replace(/[^a-zA-Z0-9]/g, "")
        : `point${idx + 1}`;
      const pathName = `${startPoseName}TO${endPoseName}`;
      return `  private PathChain ${pathName};`;
    })
    .join("\n");

  // Generate ProgressTracker field
  const progressTrackerField = `  private final ProgressTracker progressTracker;`;

  // Generate addCommands calls with event handling; iterate sequence if provided
  const commands: string[] = [];

  const defaultSequence: SequenceItem[] = lines.map((ln, idx) => ({
    kind: "path",
    lineId: ln.id || `line-${idx + 1}`,
  }));
  const seq = sequence && sequence.length ? sequence : defaultSequence;

  seq.forEach((item, idx) => {
    if (item.kind === "wait") {
      commands.push(`        new WaitCommand(${(item as any).durationMs})`);
      return;
    }
    const lineIdx = lines.findIndex((l) => l.id === (item as any).lineId);
    if (lineIdx < 0) {
      return; // skip if sequence references a missing line
    }
    const line = lines[lineIdx];
    if (!line) {
      return;
    }
    const startPoseName =
      lineIdx === 0
        ? "startPoint"
        : lines[lineIdx - 1]?.name
          ? lines[lineIdx - 1]!.name!.replace(/[^a-zA-Z0-9]/g, "")
          : `point${lineIdx}`;
    const endPoseName = line.name
      ? line.name.replace(/[^a-zA-Z0-9]/g, "")
      : `point${lineIdx + 1}`;
    const pathName = `${startPoseName}TO${endPoseName}`;
    const pathDisplayName = `${startPoseName}TO${endPoseName}`;

    if (line.eventMarkers && line.eventMarkers.length > 0) {
      // Path has event markers - use reg.java style structure
      // First: InstantCommand to set up tracker
      commands.push(`        new InstantCommand(
            () -> {
              progressTracker.setCurrentChain(${pathName});
              progressTracker.setCurrentPathName("${pathDisplayName}");`);

      // Add event registrations
      line.eventMarkers.forEach((event) => {
        commands[commands.length - 1] += `
              progressTracker.registerEvent("${event.name}", ${event.position.toFixed(3)});`;
      });

      commands[commands.length - 1] += `
            })`;

      // Second: ParallelRaceGroup for following path with event handling
      commands.push(`        new ParallelRaceGroup(
            new FollowPathCommand(follower, ${pathName}),
            new SequentialCommandGroup(`);

      // Add WaitUntilCommand for each event
      line.eventMarkers.forEach((event, eventIdx) => {
        if (eventIdx > 0) commands[commands.length - 1] += ",";
        commands[commands.length - 1] += `
                new WaitUntilCommand(() -> progressTracker.shouldTriggerEvent("${event.name}")),
                new InstantCommand(
                    () -> {
                      progressTracker.executeEvent("${event.name}");
                    })`;
      });

      commands[commands.length - 1] += `
            ))`;
    } else {
      // No event markers - simple InstantCommand + FollowPathCommand
      commands.push(`        new InstantCommand(
            () -> {
              progressTracker.setCurrentChain(${pathName});
              progressTracker.setCurrentPathName("${pathDisplayName}");
            }),
        new FollowPathCommand(follower, ${pathName})`);
    }
  });

  // Generate path building
  const pathBuilders = lines
    .map((line, idx) => {
      const startPoseName =
        idx === 0
          ? "startPoint"
          : lines[idx - 1]?.name
            ? lines[idx - 1]!.name!.replace(/[^a-zA-Z0-9]/g, "")
            : `point${idx}`;
      const endPoseName = line.name
        ? line.name.replace(/[^a-zA-Z0-9]/g, "")
        : `point${idx + 1}`;
      const pathName = `${startPoseName}TO${endPoseName}`;

      const isCurve = line.controlPoints.length > 0;
      const curveType = isCurve ? "BezierCurve" : "BezierLine";

      // Build control points string
      let controlPointsStr = "";
      if (isCurve) {
        const controlPoints: string[] = [];
        line.controlPoints.forEach((_, cpIdx) => {
          const controlPointName = `${endPoseName}_control${cpIdx + 1}`;
          controlPoints.push(controlPointName);
        });
        controlPointsStr = controlPoints.join(", ") + ", ";
      }

      // Determine heading interpolation
      let headingConfig = "";
      if (line.endPoint.heading === "constant") {
        headingConfig = `setConstantHeadingInterpolation(${endPoseName}.getHeading())`;
      } else if (line.endPoint.heading === "linear") {
        headingConfig = `setLinearHeadingInterpolation(${startPoseName}.getHeading(), ${endPoseName}.getHeading())`;
      } else {
        headingConfig = `setTangentHeadingInterpolation()`;
      }

      // Build reverse config
      const reverseConfig = line.endPoint.reverse
        ? "\n            .setReversed(true)"
        : "";

      return `${pathName} =
        follower
            .pathBuilder()
            .addPath(new ${curveType}(${startPoseName}, ${controlPointsStr}${endPoseName}))
            .${headingConfig}${reverseConfig}
            .build();`;
    })
    .join("\n\n    ");

  const sequentialCommandCode = `
package org.firstinspires.ftc.teamcode.Commands.AutoCommands;

import com.pedropathing.follower.Follower;
import com.pedropathing.geometry.BezierCurve;
import com.pedropathing.geometry.BezierLine;
import com.pedropathing.geometry.Pose;
import com.pedropathing.paths.PathChain;
import com.qualcomm.robotcore.hardware.HardwareMap;
import com.seattlesolvers.solverslib.command.SequentialCommandGroup;
import com.seattlesolvers.solverslib.command.ParallelRaceGroup;
import com.seattlesolvers.solverslib.command.WaitUntilCommand;
import com.seattlesolvers.solverslib.command.WaitCommand;
import com.seattlesolvers.solverslib.command.InstantCommand;
import com.seattlesolvers.solverslib.pedroCommand.FollowPathCommand;
import org.firstinspires.ftc.robotcore.external.Telemetry;
import org.firstinspires.ftc.teamcode.Utils.Pathing.ProgressTracker;
import java.io.IOException;
import org.firstinspires.ftc.teamcode.Subsystems.Drivetrain;
import org.firstinspires.ftc.teamcode.Utils.PedroPathReader;

public class ${className} extends SequentialCommandGroup {

  private final Follower follower;
  ${progressTrackerField}

  // Poses
${allPoseDeclarations.join("\n")}

  // Path chains
${pathChainDeclarations}

  public ${className}(final Drivetrain drive, HardwareMap hw, Telemetry telemetry) throws IOException {
    this.follower = drive.getFollower();
    this.progressTracker = new ProgressTracker(follower, telemetry);

    PedroPathReader pp = new PedroPathReader("${fileName ? fileName.split(/[\\/]/).pop() + ".pp" || "AutoPath.pp" : "AutoPath.pp"}", hw.appContext);

    // Load poses
${allPoseInitializations.join("\n")}

    follower.setStartingPose(startPoint);

    buildPaths();

    addCommands(
${commands.join(",\n")});
  }

  public void buildPaths() {
    ${pathBuilders}
  }
}
`;

  try {
    const javaPlugin = await loadJavaPlugin();
    const formattedCode = await prettier.format(sequentialCommandCode, {
      parser: "java",
      plugins: javaPlugin ? [javaPlugin] : [],
    });
    return formattedCode;
  } catch (error) {
    console.error("Code formatting error:", error);
    return sequentialCommandCode;
  }
}
