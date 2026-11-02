import { expect, test } from "@playwright/test";

test("tile-size settings preserve tile positions and persist recalibrated inches", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (localStorage.getItem("tile-resize-seeded")) return;
    localStorage.setItem("tile-resize-seeded", "true");
    localStorage.setItem(
      "pedro_session_recovery_v1",
      JSON.stringify({
        version: "2.2.0",
        coordinates: {
          coordinateSystem: "ftc",
          distanceUnit: "tiles",
          tileSize: 23.5,
        },
        settings: {
          coordinateSystem: "ftc",
          distanceUnit: "tiles",
          tileSize: 23.5,
        },
        startPoint: { x: 70.75, y: 70.75, headingDeg: 0 },
        lines: [
          {
            id: "path",
            kind: "atomic",
            color: "red",
            endPoint: { x: 117.75, y: 23.75 },
            controlPoints: [],
            heading: { type: "constant", degrees: 0 },
          },
        ],
        shapes: [],
      }),
    );
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("End X", { exact: true })).toHaveValue("2");
  await expect(page.getByLabel("End Y", { exact: true })).toHaveValue("2");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Inches per tile", { exact: true }).fill("24");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByLabel("End X", { exact: true })).toHaveValue("2");
  await expect(page.getByLabel("End Y", { exact: true })).toHaveValue("2");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const saved = JSON.parse(
          localStorage.getItem("pedro_session_recovery_v1") ?? "{}",
        );
        return {
          tileSize: saved.coordinates?.tileSize,
          point: saved.lines?.[0].endPoint,
        };
      }),
    )
    .toEqual({ tileSize: 24, point: { x: 118.75, y: 22.75 } });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("End X", { exact: true })).toHaveValue("2");
  await expect(page.getByLabel("End Y", { exact: true })).toHaveValue("2");
});
