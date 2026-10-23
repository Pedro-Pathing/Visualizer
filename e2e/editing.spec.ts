import { expect, test, type Page } from "@playwright/test";

/** The default project: one path ending at (56, 36), drawn as `point-1-0`. */
const ENDPOINT = "#point-1-0";

async function openApp(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator(ENDPOINT)).toBeVisible();
  return errors;
}

/** The selected path's end point, as the inspector's fields show it. */
async function selectedPoint(page: Page) {
  const value = async (label: string) =>
    Number(await page.getByLabel(label, { exact: true }).inputValue()).toFixed(
      1,
    );
  return `${await value("End X")}, ${await value("End Y")}`;
}

const expectSelectedPoint = (page: Page, text: string) =>
  expect.poll(() => selectedPoint(page)).toBe(text);

async function drag(page: Page, selector: string, dx: number, dy: number) {
  const box = (await page.locator(selector).boundingBox())!;
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let step = 1; step <= 10; step++) {
    await page.mouse.move(
      start.x + (dx * step) / 10,
      start.y + (dy * step) / 10,
    );
  }
  await page.mouse.up();
}

const undo = (page: Page) => page.getByTitle("Undo").click();
const redo = (page: Page) => page.getByTitle("Redo").click();
const pathCount = (page: Page) =>
  page.locator('[id^="point-"][id$="-0"]:not([id$="-0-0"])').count();

test("loads without errors", async ({ page }) => {
  const errors = await openApp(page);
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test("dragging a point moves it, and undo and redo restore it", async ({
  page,
}) => {
  await openApp(page);
  await expectSelectedPoint(page, "56.0, 36.0");

  await drag(page, ENDPOINT, 120, 0);
  const moved = await selectedPoint(page);
  expect(moved).not.toBe("56.0, 36.0");

  await undo(page);
  await expectSelectedPoint(page, "56.0, 36.0");
  await redo(page);
  await expectSelectedPoint(page, moved);
});

test("one drag is one undo step", async ({ page }) => {
  await openApp(page);
  await drag(page, ENDPOINT, 60, 0);
  const afterFirst = await selectedPoint(page);
  await drag(page, ENDPOINT, 60, 0);

  await undo(page);
  await expectSelectedPoint(page, afterFirst);
  await undo(page);
  await expectSelectedPoint(page, "56.0, 36.0");
});

test("adding a path is undoable", async ({ page }) => {
  await openApp(page);
  expect(await pathCount(page)).toBe(1);

  await page.getByRole("button", { name: "Add path" }).click();
  await expect.poll(() => pathCount(page)).toBe(2);

  await undo(page);
  await expect.poll(() => pathCount(page)).toBe(1);
});

test("typing a coordinate moves the point in one undo step", async ({
  page,
}) => {
  await openApp(page);
  await page.getByLabel("End X", { exact: true }).fill("100");
  await expectSelectedPoint(page, "100.0, 36.0");

  await undo(page);
  await expectSelectedPoint(page, "56.0, 36.0");
});

test("the session survives a reload", async ({ page }) => {
  await openApp(page);
  await drag(page, ENDPOINT, 120, 0);
  const moved = await selectedPoint(page);
  await page.waitForTimeout(1000);

  await page.reload();
  await expect(page.locator(ENDPOINT)).toBeVisible();
  await expectSelectedPoint(page, moved);
});

test("clicking empty field shows the project, and Escape does too", async ({
  page,
}) => {
  await openApp(page);
  await expect(page.getByRole("heading", { name: "Path" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Project" })).toBeVisible();

  await page.locator(ENDPOINT).click();
  await expect(page.getByRole("heading", { name: "Path" })).toBeVisible();
  const field = (await page.getByRole("application").boundingBox())!;
  await page.mouse.click(field.x + 10, field.y + field.height - 10);
  await expect(page.getByRole("heading", { name: "Project" })).toBeVisible();
});

test("the command palette runs an action", async ({ page }) => {
  await openApp(page);
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Command" }).fill("add path");
  await page.keyboard.press("Enter");
  await expect.poll(() => pathCount(page)).toBe(2);
});

test("duplicate mirrored opens a mirrored copy", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Duplicate mirrored…" }).click();
  await page.getByRole("button", { name: "Create" }).click();
  await expect(
    page.getByText("path_mirrored.pp", { exact: true }),
  ).toBeVisible();
  // The field is 141.5" wide, so x = 56 lands on 85.5.
  await page.locator(ENDPOINT).click();
  await expectSelectedPoint(page, "85.5, 36.0");
});

test("the context menu adds a control point", async ({ page }) => {
  await openApp(page);
  await page.locator(ENDPOINT).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Add control point here" }).click();
  await expect(page.getByLabel("CP1 X", { exact: true })).toBeVisible();
});
