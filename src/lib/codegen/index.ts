import type { Path, SequenceItem, StartPose } from "../../types";
import { LEGACY_FRAME, type Frame } from "../../utils/frame";
import { emitSource } from "./emit";
import { formatSource } from "./format";
import { javaSpec } from "./languages/java";
import { kotlinSpec } from "./languages/kotlin";
import type { LanguageSpec } from "./languages/spec";
import { buildExportModel } from "./model";
import type { ExportMode } from "./types";

export { buildExportModel } from "./model";
export { emitSource, pathExpression } from "./emit";
export { javaSpec } from "./languages/java";
export { kotlinSpec } from "./languages/kotlin";
export { PEDRO_API } from "./pedroApi";
export { generatePointsArray } from "./points";
export type { LanguageSpec } from "./languages/spec";
export type * from "./types";

/**
 * The frame exported code is written in.
 *
 * A Pose literal carries no record of which coordinate frame it is written in,
 * and PoseFactory offers no way to declare one, so exports use Pedro's own
 * frame no matter which frame the editor displays. Should PoseFactory gain a
 * way to state its convention, pass the user's frame here and have
 * `poseFactoryInitializer` emit that declaration plus any leftover translation;
 * the exported numbers would then match the ones on screen.
 */
export const EXPORT_FRAME: Frame = LEGACY_FRAME;

export type Language = "java" | "kotlin";

const SPECS: Record<Language, LanguageSpec> = {
  java: javaSpec,
  kotlin: kotlinSpec,
};

export interface GenerateInput {
  startPoint: StartPose;
  lines: Path[];
  /** The frame the emitted coordinates are expressed in. */
  frame: Frame;
  exportMode?: ExportMode;
  mirrorHorizontally?: boolean;
}

export async function generateCode(
  language: Language,
  { exportMode = "class", ...input }: GenerateInput,
): Promise<string> {
  const spec = SPECS[language];
  const source = emitSource(buildExportModel(input), spec, exportMode);
  if (exportMode === "coordinates") return source;
  return formatSource(source, spec);
}

export function generateSequentialCommandCode(input: {
  startPoint: StartPose;
  lines: Path[];
  frame: Frame;
  className?: string | null;
  sequence?: SequenceItem[];
}): Promise<string> {
  return formatSource(
    emitSource(buildExportModel(input), javaSpec, "full"),
    javaSpec,
  );
}
