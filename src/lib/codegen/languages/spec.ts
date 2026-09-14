export type ClassKind = "paths" | "opmode";
export interface ImportNeeds {
  interpolator: boolean;
}

export interface LanguageSpec {
  id: "java" | "kotlin";

  prettier: { parser: string; pluginSpecifier: string };

  terminator: string;

  numberLiteral(value: number): string;

  lambda(parameter: string, body: string): string;

  comment(text: string): string;

  packageStatement(packageName: string): string;

  imports(kind: ClassKind, needs: ImportNeeds): string;

  classOpen(className: string, kind: ClassKind): string;

  poseFactoryField(initializer: string): string;

  poseField(name: string, initializer: string): string;

  pathMethod(name: string, expression: string): string;

  followerField(): string;

  autoRoutineMethod(sequenceBody: string): string;

  runOpModeMethod(body: string): string;
}
