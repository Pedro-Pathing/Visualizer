/** Which app-level dialog is open. */
export class Dialogs {
  fileManager = $state(false);
  settings = $state(false);
  palette = $state(false);
  exportCode = $state(false);
  anyOpen = $derived(
    this.fileManager || this.settings || this.palette || this.exportCode,
  );
}
