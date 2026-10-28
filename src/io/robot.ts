import type { RobotConfig, Settings } from "../types";

export const ROBOT_CONFIG_KEYS = [
  "forwardVelocity",
  "strafeVelocity",
  "aVelocity",
  "kFriction",
  "rLength",
  "rWidth",
  "safetyMargin",
  "maxAcceleration",
  "maxDeceleration",
] as const satisfies readonly (keyof RobotConfig)[];

export function robotConfigOf(settings: Settings): RobotConfig {
  return normalizeRobotConfig(settings, settings);
}

/** Each key from `input` when it is a finite number, else from `fallback`. */
export function normalizeRobotConfig(
  input: unknown,
  fallback: RobotConfig,
): RobotConfig {
  const source = (input ?? {}) as Partial<Record<keyof RobotConfig, unknown>>;
  const config: Partial<RobotConfig> = {};
  for (const key of ROBOT_CONFIG_KEYS) {
    const value = source[key];
    const chosen =
      typeof value === "number" && Number.isFinite(value)
        ? value
        : fallback[key];
    if (chosen !== undefined) config[key] = chosen;
  }
  return config as RobotConfig;
}
