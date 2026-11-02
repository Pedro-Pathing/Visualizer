import { expect, test } from "@playwright/test";

// Old untagged built-ins must upgrade, while the custom square stays physical.
test("calibrated obstacle outlines and collision contact share the image geometry", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (localStorage.getItem("obstacle-calibration-seeded")) return;
    localStorage.setItem("obstacle-calibration-seeded", "true");
    localStorage.setItem(
      "pedro_session_recovery_v1",
      JSON.stringify({
        version: "2.1.0",
        coordinates: {
          coordinateSystem: "pedro",
          distanceUnit: "inches",
          tileSize: 23.5,
        },
        settings: {
          tileSize: 23.5,
          fieldMap: "decode.webp",
          experimentalFeatures: { obstacles: true },
        },
        robot: { rLength: 1, rWidth: 1, safetyMargin: 0 },
        startPoint: { x: 44, y: 70.75, headingDeg: 0 },
        lines: [
          {
            kind: "atomic",
            id: "cross",
            color: "red",
            endPoint: { x: 52, y: 70.75 },
            controlPoints: [],
            heading: { type: "constant", degrees: 0 },
          },
        ],
        shapes: [
          {
            id: "biobuzz-red-hive",
            name: "Red HIVE",
            color: "red",
            fillColor: "red",
            vertices: [
              { x: 46, y: 50 },
              { x: 48.6, y: 50 },
              { x: 48.6, y: 91.4 },
              { x: 46, y: 91.4 },
            ],
          },
          {
            id: "custom",
            name: "Custom",
            color: "blue",
            fillColor: "blue",
            vertices: [
              { x: 5, y: 5 },
              { x: 6, y: 5 },
              { x: 6, y: 6 },
              { x: 5, y: 6 },
            ],
          },
        ],
      }),
    );
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#shape-0")).toBeVisible();
  await expect(page.getByAltText("Field", { exact: true })).toHaveAttribute(
    "src",
    /biobuzz-(dark|light)\.webp$/,
  );
  await expect(
    page.getByRole("button", { name: "Hits Red HIVE", exact: true }),
  ).toBeVisible();
  const verify = async () => {
    const image = (await page
      .getByAltText("Field", { exact: true })
      .boundingBox())!;
    const vertex = await page.locator("#shape-0").evaluate((element) => {
      const path = element as SVGPathElement;
      const point = path
        .getPointAtLength(0)
        .matrixTransform(path.getScreenCTM()!);
      return { x: point.x, y: point.y };
    });
    // The source outline's (46,50) vertex was traced on a 144-inch image
    // inset by -1.25 inches. This normalized location must stay fixed.
    expect(
      Math.abs(vertex.x - image.x - (image.width * 47.25) / 144),
    ).toBeLessThan(0.1);
    expect(
      Math.abs(vertex.y - image.y - (image.height * 92.75) / 144),
    ).toBeLessThan(0.1);
    const left = Number(
      (await page.locator("#shape-0").getAttribute("d"))!.match(/[-\d.]+/)![0],
    );
    const footprint = (await page
      .getByTestId("collision-footprint")
      .first()
      .getAttribute("d"))!
      .match(/-?\d+(?:\.\d+)?/g)!
      .map(Number);
    expect(Math.max(...footprint.filter((_, i) => i % 2 === 0))).toBeCloseTo(
      left,
      3,
    );
  };
  await verify();
  const beforeCustom = await page.locator("#shape-1").getAttribute("d");
  const beforePath = await page
    .getByLabel("End X", { exact: true })
    .inputValue();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Inches per tile", { exact: true }).fill("24");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("#shape-0")).toHaveAttribute("d", /^M 46 /);
  await verify();
  expect(await page.locator("#shape-1").getAttribute("d")).toBe(beforeCustom);
  expect(await page.getByLabel("End X", { exact: true }).inputValue()).toBe(
    beforePath,
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("pedro_session_recovery_v1") ?? "{}")
            .shapes?.[0].fieldCalibration?.tileSize,
      ),
    )
    .toBe(24);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#shape-0")).toHaveAttribute("d", /^M 46 /);
  await verify();
  expect(errors).toEqual([]);
});
