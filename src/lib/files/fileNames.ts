import { promptDialog } from "../dialog";
import { PROJECT_EXTENSION, stripProjectExtension } from "../../utils/filename";

const FILE_STEM_PATTERN = /^[a-zA-Z0-9_\-. ]+$/;

/** `name` with the current extension, replacing a legacy `.pp` ending. */
export const withExtension = (name: string) =>
  `${stripProjectExtension(name)}${PROJECT_EXTENSION}`;

/** Ask for a project file name; resolves with the extension added, or null if cancelled. */
export async function askFileName(options: {
  title: string;
  value: string;
  confirmLabel: string;
  hint?: string;
  /** Whether a name belongs to another file and can't be used. */
  isTaken?: (name: string) => boolean;
}): Promise<string | null> {
  const name = await promptDialog({
    title: options.title,
    value: options.value,
    placeholder: "my_path",
    hint: options.hint ?? `Saved in the app as a ${PROJECT_EXTENSION} file.`,
    confirmLabel: options.confirmLabel,
    validate: (input) => {
      if (!FILE_STEM_PATTERN.test(stripProjectExtension(input))) {
        return "Use letters, numbers, spaces, dots, dashes and underscores.";
      }
      if (options.isTaken?.(withExtension(input))) {
        return "A file with this name already exists.";
      }
      return null;
    },
  });
  return name && withExtension(name);
}
