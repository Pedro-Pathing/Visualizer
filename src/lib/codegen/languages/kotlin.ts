import { round } from "../numbers";
import { PEDRO_API } from "../pedroApi";
import type { ClassKind, ImportNeeds, LanguageSpec } from "./spec";

const PATHS_IMPORTS = `import com.pedropathing.api.Paths.*
import com.pedropathing.api.PoseFactory
import com.pedropathing.math.Pose
import com.pedropathing.paths.Path`;

const OPMODE_IMPORTS = `import com.pedropathing.api.Paths.*
import com.pedropathing.api.PoseFactory
import com.pedropathing.follower.Follower
import com.pedropathing.math.Pose
import com.pedropathing.paths.Path
import com.pedropathing.ivy.Command
import com.pedropathing.ivy.Scheduler
import com.pedropathing.ivy.Scheduler.schedule
import com.pedropathing.ivy.commands.Commands.*
import com.pedropathing.ivy.groups.Groups.sequential
import com.pedropathing.ivy.pedro.PedroCommands.follow
import com.qualcomm.robotcore.eventloop.opmode.Autonomous
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode`;

export const kotlinSpec: LanguageSpec = {
  id: "kotlin",

  prettier: { parser: "kotlin", pluginSpecifier: "prettier-plugin-kotlin" },

  terminator: "",

  numberLiteral(value: number): string {
    // Kotlin does not widen Int to Double, so every argument to Pose.of has to
    // carry a decimal point.
    const rounded = round(value);
    return Number.isInteger(rounded) ? `${rounded}.0` : rounded.toString();
  },

  lambda(parameter: string, body: string): string {
    return `{ ${parameter} -> ${body} }`;
  },

  comment(text: string): string {
    return `// ${text}`;
  },

  packageStatement(packageName: string): string {
    return `package ${packageName}`;
  },

  imports(kind: ClassKind, needs: ImportNeeds): string {
    const base = kind === "opmode" ? OPMODE_IMPORTS : PATHS_IMPORTS;
    return needs.interpolator
      ? `${base}\nimport ${PEDRO_API.interpolator.importPath}`
      : base;
  },

  classOpen(className: string, kind: ClassKind): string {
    return kind === "opmode"
      ? `@Autonomous(name = "${className}", group = "Autonomous")\nclass ${className} : LinearOpMode() {`
      : `class ${className} {`;
  },

  poseFactoryField(initializer: string): string {
    return `    private val ${PEDRO_API.factoryVar} = ${initializer}`;
  },

  poseField(name: string, initializer: string): string {
    return `    private val ${name} = ${initializer}`;
  },

  pathMethod(name: string, expression: string): string {
    return `    fun ${name}(): Path = ${expression}`;
  },

  followerField(): string {
    return "    private lateinit var follower: Follower";
  },

  autoRoutineMethod(sequenceBody: string): string {
    return `    fun autoRoutine(): Command = sequential(\n${sequenceBody}\n    )`;
  },

  runOpModeMethod(body: string): string {
    return `    override fun runOpMode() {\n${body}\n    }`;
  },
};
