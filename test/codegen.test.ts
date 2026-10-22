import { describe, expect, it } from "vitest";
import {
  generateJavaCode,
  generateKotlinCode,
  generatePointsArray,
  generateSequentialCommandCode,
  type ExportMode,
} from "../src/lib/codegen";
import { fixtures, goldenPath, loadProject } from "./support/fixtures";

const languages = [
  { id: "java", ext: "java", generate: generateJavaCode },
  { id: "kotlin", ext: "kt", generate: generateKotlinCode },
] as const;
const modes: ExportMode[] = ["coordinates", "class", "full"];

describe.each(fixtures)("code export of $name", ({ name, raw }) => {
  for (const { id, ext, generate } of languages) {
    for (const mode of modes) {
      for (const mirrored of [false, true]) {
        const file = `${id}-${mode}${mirrored ? "-mirrored" : ""}.${ext}`;
        it(file, async () => {
          const { startPoint, lines } = loadProject(raw);
          const source = await generate(startPoint, lines, mode, mirrored);
          await expect(source).toMatchFileSnapshot(
            goldenPath(name, "codegen", file),
          );
        });
      }
    }
  }

  it("sequential-command.java", async () => {
    const { startPoint, lines, sequence } = loadProject(raw);
    const source = await generateSequentialCommandCode(
      startPoint,
      lines,
      "Auto",
      sequence,
    );
    await expect(source).toMatchFileSnapshot(
      goldenPath(name, "codegen", "sequential-command.java"),
    );
  });

  it("points-array.txt", async () => {
    const { startPoint, lines } = loadProject(raw);
    await expect(generatePointsArray(startPoint, lines)).toMatchFileSnapshot(
      goldenPath(name, "codegen", "points-array.txt"),
    );
  });
});
