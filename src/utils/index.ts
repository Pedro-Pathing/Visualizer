export * from "./animation";
export * from "./codeExporter";
export * from "./draw";
export * from "./file";
export * from "./geometry";
export * from "./math";
export * from "./shapes";
export * from "./timeCalculator";
export * from "./directorySettings";

export const DPI = 96 / 5;

export const titleCase = (str: string) =>
  `${str[0].toUpperCase()}${str.slice(1).toLowerCase()}`;
