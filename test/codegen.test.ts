import { describe, expect, it } from "vitest";
import {
  generateJavaCode,
  generateKotlinCode,
  generatePointsArray,
  generateSequentialCommandCode,
  type ExportMode,
} from "../src/lib/codegen";
import { MIRROR_AXIS } from "../src/model/mirror";
import { fixtures, goldenPath, loadProject } from "./support/fixtures";

const languages = [
  { id: "java", ext: "java", generate: generateJavaCode },
  { id: "kotlin", ext: "kt", generate: generateKotlinCode },
] as const;
const modes: ExportMode[] = ["coordinates", "class", "full"];

const PLAIN_FACTORY = "PoseFactory.degrees()";
const MIRRORED_FACTORY = `PoseFactory.degrees().mirrorX(${MIRROR_AXIS})`;

describe.each(fixtures)("code export of $name", ({ name, text }) => {
  for (const { id, ext, generate } of languages) {
    for (const mode of modes) {
      const file = `${id}-${mode}.${ext}`;
      it(file, async () => {
        const { startPoint, lines } = loadProject(text);
        const source = await generate(startPoint, lines, mode, false);
        await expect(source).toMatchFileSnapshot(
          goldenPath(name, "codegen", file),
        );
      });

      // Pedro mirrors at runtime, so only the pose factory changes.
      it(`${file} mirrored`, async () => {
        const { startPoint, lines } = loadProject(text);
        const plain = await generate(startPoint, lines, mode, false);
        const mirrored = await generate(startPoint, lines, mode, true);
        expect(plain.split(PLAIN_FACTORY)).toHaveLength(2);
        expect(mirrored).toBe(plain.replace(PLAIN_FACTORY, MIRRORED_FACTORY));
      });
    }
  }

  it("sequential-command.java", async () => {
    const { startPoint, lines, sequence } = loadProject(text);
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
    const { startPoint, lines } = loadProject(text);
    await expect(generatePointsArray(startPoint, lines)).toMatchFileSnapshot(
      goldenPath(name, "codegen", "points-array.txt"),
    );
  });
});
