// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { installShortcuts } from "../src/lib/shortcuts";

function press(init: KeyboardEventInit, target: EventTarget = document.body) {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

describe("installShortcuts", () => {
  let uninstall = () => {};
  afterEach(() => uninstall());

  it("tells a plain key apart from the same key with a modifier", () => {
    const save = vi.fn();
    const removePoint = vi.fn();
    uninstall = installShortcuts([
      { keys: ["mod+s"], run: save },
      { keys: ["s"], run: removePoint },
    ]);

    press({ key: "s", metaKey: true });
    press({ key: "s", ctrlKey: true });
    expect(save).toHaveBeenCalledTimes(2);
    expect(removePoint).not.toHaveBeenCalled();

    press({ key: "s" });
    expect(removePoint).toHaveBeenCalledTimes(1);
  });

  it("requires shift exactly when the spec asks for it", () => {
    const undo = vi.fn();
    const redo = vi.fn();
    uninstall = installShortcuts([
      { keys: ["mod+z"], run: undo },
      { keys: ["mod+shift+z", "ctrl+y"], run: redo },
    ]);

    press({ key: "z", metaKey: true });
    press({ key: "Z", metaKey: true, shiftKey: true });
    press({ key: "y", ctrlKey: true });
    expect(undo).toHaveBeenCalledTimes(1);
    expect(redo).toHaveBeenCalledTimes(2);
  });

  it("matches space by code and prevents the page scrolling", () => {
    const toggle = vi.fn();
    uninstall = installShortcuts([{ keys: ["space"], run: toggle }]);
    const event = press({ key: " ", code: "Space" });
    expect(toggle).toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it("skips a shortcut whose condition is false", () => {
    const play = vi.fn();
    const exitTool = vi.fn();
    let drawing = true;
    uninstall = installShortcuts([
      { keys: ["space"], when: () => drawing, run: exitTool },
      { keys: ["space"], run: play },
    ]);

    press({ key: " ", code: "Space" });
    drawing = false;
    press({ key: " ", code: "Space" });
    expect(exitTool).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("ignores keys typed into a field", () => {
    const addPath = vi.fn();
    uninstall = installShortcuts([{ keys: ["w"], run: addPath }]);
    const input = document.createElement("input");
    document.body.append(input);
    press({ key: "w" }, input);
    expect(addPath).not.toHaveBeenCalled();
    input.remove();
  });
});
