import type { RobotConfig } from "../types";

export interface MotionProfile {
  /** Seconds to cover the distance. */
  duration: number;
  /** Inches covered after `time` seconds. */
  distanceAt(time: number): number;
}

type ProfileLimits = Pick<
  RobotConfig,
  | "xVelocity"
  | "yVelocity"
  | "maxVelocity"
  | "maxAcceleration"
  | "maxDeceleration"
>;

/**
 * A trapezoidal velocity profile over `distance` inches, or a triangular one
 * when the distance is too short to reach full speed. Without usable limits
 * the robot drives at its average axis velocity throughout.
 */
export function motionProfile(
  distance: number,
  limits: ProfileLimits,
): MotionProfile {
  if (distance <= 0) return { duration: 0, distanceAt: () => 0 };

  const maxVelocity = limits.maxVelocity;
  const acceleration = limits.maxAcceleration;
  const deceleration = limits.maxDeceleration || acceleration;
  if (!(maxVelocity > 0 && acceleration > 0 && deceleration > 0)) {
    const speed = (limits.xVelocity + limits.yVelocity) / 2;
    return {
      duration: distance / speed,
      distanceAt: (time) => clampTo(time * speed, distance),
    };
  }

  const peakVelocity = Math.min(
    maxVelocity,
    Math.sqrt(
      (2 * distance * acceleration * deceleration) /
        (acceleration + deceleration),
    ),
  );
  const accelerationTime = peakVelocity / acceleration;
  const decelerationTime = peakVelocity / deceleration;
  const accelerationDistance = 0.5 * acceleration * accelerationTime ** 2;
  const decelerationDistance = 0.5 * deceleration * decelerationTime ** 2;
  const cruiseTime = Math.max(
    0,
    (distance - accelerationDistance - decelerationDistance) / peakVelocity,
  );
  const cruiseEnd = accelerationTime + cruiseTime;

  return {
    duration: cruiseEnd + decelerationTime,
    distanceAt(time) {
      if (time <= 0) return 0;
      if (time <= accelerationTime) return 0.5 * acceleration * time ** 2;
      if (time <= cruiseEnd) {
        return accelerationDistance + peakVelocity * (time - accelerationTime);
      }
      const braking = Math.min(time - cruiseEnd, decelerationTime);
      return clampTo(
        accelerationDistance +
          peakVelocity * cruiseTime +
          peakVelocity * braking -
          0.5 * deceleration * braking ** 2,
        distance,
      );
    },
  };
}

function clampTo(value: number, max: number) {
  return Math.min(Math.max(value, 0), max);
}
