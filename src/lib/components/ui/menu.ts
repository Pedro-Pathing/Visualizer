export interface MenuItem {
  label: string;
  /** Shown on the right, usually the shortcut. */
  hint?: string;
  disabled?: boolean;
  danger?: boolean;
  run: () => void;
}

export type MenuEntry = MenuItem | "separator";
