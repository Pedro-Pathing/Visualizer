import { promptDialog } from "../dialog";

const FILE_NAME_PATTERN = /^[a-zA-Z0-9_\-. ]+\.pp$/;

export const withExtension = (name: string) =>
  name.endsWith(".pp") ? name : `${name}.pp`;

/** Ask for a project file name; resolves with `.pp` added, or null if cancelled. */
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
    hint: options.hint ?? "Saved in the app as a .pp file.",
    confirmLabel: options.confirmLabel,
    validate: (input) => {
      const fileName = withExtension(input);
      if (!FILE_NAME_PATTERN.test(fileName)) {
        return "Use letters, numbers, spaces, dots, dashes and underscores.";
      }
      if (options.isTaken?.(fileName)) {
        return "A file with this name already exists.";
      }
      return null;
    },
  });
  return name && withExtension(name);
}
