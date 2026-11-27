import type { BasePoint, RobotConfig } from "../types";
import { getRobotCorners } from "../utils/geometry";

type PivotOffset = Pick<RobotConfig, "drivetrainOffsetX" | "drivetrainOffsetY">;
export type RobotBody = PivotOffset & Pick<RobotConfig, "rLength" | "rWidth">;

/** Physical center in field coordinates, given the drivetrain pose. */
export function robotBodyCenter(
  { x, y, heading }: BasePoint & { heading: number },
  { drivetrainOffsetX = 0, drivetrainOffsetY = 0 }: PivotOffset,
): BasePoint {
  if (!drivetrainOffsetX && !drivetrainOffsetY) return { x, y };

  const radians = (heading * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  
  return {
    x: x - drivetrainOffsetX * cos + drivetrainOffsetY * sin,
    y: y - drivetrainOffsetX * sin - drivetrainOffsetY * cos,
  };
}

export function robotBodyCorners(
  pose: BasePoint & { heading: number },
  robot: RobotBody,
  margin = 0,
): BasePoint[] {
  const center = robotBodyCenter(pose, robot);
  return getRobotCorners(
    center.x,
    center.y,
    pose.heading,
    robot.rLength + 2 * margin,
    robot.rWidth + 2 * margin,
  );
}
