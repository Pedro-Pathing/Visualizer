import { round } from "../numbers";
import { PEDRO_API } from "../pedroApi";
import type { ClassKind, ImportNeeds, LanguageSpec } from "./spec";

const PATHS_IMPORTS = `import static com.pedropathing.api.Paths.*;

import com.pedropathing.api.PoseFactory;
import com.pedropathing.math.Pose;
import com.pedropathing.paths.Path;`;

const OPMODE_IMPORTS = `import static com.pedropathing.api.Paths.*;

import com.pedropathing.api.PoseFactory;
import com.pedropathing.follower.Follower;
import com.pedropathing.math.Pose;
import com.pedropathing.paths.Path;
import com.pedropathing.ivy.Command;
import com.pedropathing.ivy.Scheduler;
import static com.pedropathing.ivy.Scheduler.schedule;
import static com.pedropathing.ivy.commands.Commands.*;
import static com.pedropathing.ivy.groups.Groups.sequential;
import static com.pedropathing.ivy.pedro.PedroCommands.follow;
import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;`;

export const javaSpec: LanguageSpec = {
  id: "java",

  prettier: { parser: "java", pluginSpecifier: "prettier-plugin-java" },

  terminator: ";",

  numberLiteral(value: number): string {
    return round(value).toString();
  },

  lambda(parameter: string, body: string): string {
    return `${parameter} -> ${body}`;
  },

  comment(text: string): string {
    return `// ${text}`;
  },

  packageStatement(packageName: string): string {
    return `package ${packageName};`;
  },

  imports(kind: ClassKind, needs: ImportNeeds): string {
    const base = kind === "opmode" ? OPMODE_IMPORTS : PATHS_IMPORTS;
    return needs.interpolator
      ? `${base}\nimport ${PEDRO_API.interpolator.importPath};`
      : base;
  },

  classOpen(className: string, kind: ClassKind): string {
    return kind === "opmode"
      ? `@Autonomous(name = "${className}", group = "Autonomous")\npublic class ${className} extends LinearOpMode {`
      : `public class ${className} {`;
  },

  poseFactoryField(initializer: string): string {
    return `    private final PoseFactory ${PEDRO_API.factoryVar} = ${initializer};`;
  },

  poseField(name: string, initializer: string): string {
    return `    private final Pose ${name} = ${initializer};`;
  },

  pathMethod(name: string, expression: string): string {
    return `    public Path ${name}() {\n        return ${expression};\n    }`;
  },

  followerField(): string {
    return "    private Follower follower;";
  },

  autoRoutineMethod(sequenceBody: string): string {
    return `    public Command autoRoutine() {\n        return sequential(\n${sequenceBody}\n        );\n    }`;
  },

  runOpModeMethod(body: string): string {
    return `    @Override\n    public void runOpMode() {\n${body}\n    }`;
  },
};
