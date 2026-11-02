import { expect, test, type Page } from "@playwright/test";

async function openFTC(page: Page) {
  await page.addInitScript(() => {
    if (localStorage.getItem("coordinate-test-seeded")) return;
    localStorage.setItem("coordinate-test-seeded", "true");
    localStorage.setItem(
      "pedro_session_recovery_v1",
      JSON.stringify({
        version: "1.5.0",
        startPoint: { x: 70.75, y: 70.75, headingDeg: -90 },
        lines: [
          {
            kind: "atomic",
            id: "ftc-path",
            color: "#4e79a7",
            endPoint: { x: 70.75, y: 47.25 },
            controlPoints: [],
            heading: { type: "constant", degrees: -90 },
          },
        ],
        fieldPoints: [{ x: 30, y: 40 }],
        shapes: [],
        settings: {
          coordinateSystem: "ftc",
          distanceUnit: "tiles",
          tileSize: 23.5,
        },
      }),
    );
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("End X", { exact: true })).toHaveValue("1");
}

async function snapshot(page: Page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("pedro_session_recovery_v1") ?? "{}"),
  );
}

test("FTC edits keep canonical geometry and survive recovery", async ({
  page,
}) => {
  await openFTC(page);
  await page.getByLabel("End X", { exact: true }).fill("2");
  await expect(page.getByLabel("End Y", { exact: true })).toHaveValue("0");
  await expect
    .poll(async () => (await snapshot(page)).lines?.[0].endPoint)
    .toEqual({ x: 70.75, y: 23.75 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("End X", { exact: true })).toHaveValue("2");
  expect((await snapshot(page)).fieldPoints).toEqual([{ x: 30, y: 40 }]);
});

test("switching frames changes numbers without moving the path", async ({
  page,
}) => {
  await openFTC(page);
  const marker = page.locator('[aria-label="Path 1 end point"]');
  const before = await marker.boundingBox();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Coordinates and Units", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("button", { name: "Display", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await page.getByLabel("Coordinate frame").selectOption("pedro");
  await page.getByLabel("Distance units").selectOption("inches");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByLabel("End X", { exact: true })).toHaveValue("70.75");
  await expect(page.getByLabel("End Y", { exact: true })).toHaveValue("47.25");
  expect(await marker.boundingBox()).toEqual(before);
});

test("project export retains coordinate preferences", async ({ page }) => {
  await openFTC(page);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Export project as PP JSON" })
    .click();
  const download = await downloaded;
  const stream = (await download.createReadStream())!;
  let text = "";
  for await (const chunk of stream) text += chunk.toString();
  const doc = JSON.parse(text);
  expect(doc.coordinates).toEqual({
    coordinateSystem: "ftc",
    distanceUnit: "tiles",
    tileSize: 23.5,
  });
  expect(doc.lines[0].endPoint).toEqual({ x: 70.75, y: 47.25 });
});

test("FTC two-by-two tiles lands on the image seams and grid after calibration", async ({
  page,
}) => {
  await openFTC(page);
  const marker = page.locator('[aria-label="Path 1 end point"]');
  const field = page.getByRole("application");
  const image = page.getByAltText("Field", { exact: true });
  await expect
    .poll(() =>
      image.evaluate((element) => (element as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.getByLabel("End X", { exact: true }).fill("2");
  await page.getByLabel("End Y", { exact: true }).fill("2");
  // Largest preset is half a tile; every full tile seam must be included.
  const checkAlignment = async () => {
    const imageBox = (await image.boundingBox())!;
    const markerBox = (await marker.boundingBox())!;
    const fieldBox = (await field.boundingBox())!;
    const target = {
      x: imageBox.x + (imageBox.width * 5) / 6,
      y: imageBox.y + (imageBox.height * 5) / 6,
    };
    expect(Math.abs(markerBox.x + markerBox.width / 2 - target.x)).toBeLessThan(
      0.1,
    );
    expect(
      Math.abs(markerBox.y + markerBox.height / 2 - target.y),
    ).toBeLessThan(0.1);
    const lines = await field.locator("svg.z-20 line").evaluateAll((nodes) =>
      nodes.map((node) => ({
        x1: Number(node.getAttribute("x1")),
        y1: Number(node.getAttribute("y1")),
        x2: Number(node.getAttribute("x2")),
        y2: Number(node.getAttribute("y2")),
      })),
    );
    expect(
      lines.some(
        (line) =>
          line.x1 === line.x2 &&
          Math.abs(line.x1 + fieldBox.x - target.x) < 0.1,
      ),
    ).toBe(true);
    expect(
      lines.some(
        (line) =>
          line.y1 === line.y2 &&
          Math.abs(line.y1 + fieldBox.y - target.y) < 0.1,
      ),
    ).toBe(true);
  };
  // Move focus out of the numeric editor so G activates the grid shortcut.
  await page.getByRole("heading", { name: "Path", exact: true }).click();
  for (let i = 0; i < 4; i++) await page.keyboard.press("g");
  await checkAlignment();
  await expect
    .poll(async () => (await snapshot(page)).lines?.[0].endPoint)
    .toEqual({ x: 117.75, y: 23.75 });
  const beforeUnits = await image.boundingBox();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Distance units").selectOption("inches");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  expect(await image.boundingBox()).toEqual(beforeUnits);
  await checkAlignment();
  // Recalibration in Tiles mode preserves the point on the same image seam.
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Distance units").selectOption("tiles");
  await page.getByLabel("Inches per tile", { exact: true }).fill("24");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect
    .poll(async () => (await snapshot(page)).coordinates?.tileSize)
    .toBe(24);
  expect((await snapshot(page)).lines[0].endPoint).toEqual({
    x: 118.75,
    y: 22.75,
  });
  await expect(page.getByLabel("End X", { exact: true })).toHaveValue("2");
  await expect(page.getByLabel("End Y", { exact: true })).toHaveValue("2");
  await checkAlignment();
});
