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

/** The selected path's end point, as the inspector shows it. */
const endpointText = (page: Page) =>
  page.getByText(/^\d+\.\d, \d+\.\d$/).first();

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
  await expect(endpointText(page)).toHaveText("56.0, 36.0");

  await drag(page, ENDPOINT, 120, 0);
  const moved = await endpointText(page).textContent();
  expect(moved).not.toBe("56.0, 36.0");

  await undo(page);
  await expect(endpointText(page)).toHaveText("56.0, 36.0");
  await redo(page);
  await expect(endpointText(page)).toHaveText(moved!);
});

test("one drag is one undo step", async ({ page }) => {
  await openApp(page);
  await drag(page, ENDPOINT, 60, 0);
  const afterFirst = await endpointText(page).textContent();
  await drag(page, ENDPOINT, 60, 0);

  await undo(page);
  await expect(endpointText(page)).toHaveText(afterFirst!);
  await undo(page);
  await expect(endpointText(page)).toHaveText("56.0, 36.0");
});

test("adding a path is undoable", async ({ page }) => {
  await openApp(page);
  expect(await pathCount(page)).toBe(1);

  await page.getByRole("button", { name: "+ Add Path" }).click();
  await expect.poll(() => pathCount(page)).toBe(2);

  await undo(page);
  await expect.poll(() => pathCount(page)).toBe(1);
});

test("typing a coordinate moves the point in one undo step", async ({
  page,
}) => {
  await openApp(page);
  const x = page.getByLabel("X", { exact: true }).last();
  await x.fill("100");
  await expect(endpointText(page)).toHaveText("100.0, 36.0");

  await undo(page);
  await expect(endpointText(page)).toHaveText("56.0, 36.0");
});

test("the session survives a reload", async ({ page }) => {
  await openApp(page);
  await drag(page, ENDPOINT, 120, 0);
  const moved = await endpointText(page).textContent();
  await page.waitForTimeout(1000);

  await page.reload();
  await expect(page.locator(ENDPOINT)).toBeVisible();
  await expect(endpointText(page)).toHaveText(moved!);
});
