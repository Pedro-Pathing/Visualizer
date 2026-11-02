# Pedro Pathing Visualizer

c3: art; ans to 1

## Plan in FTC Coordinates

Open **Settings → Coordinates and Units**. Select Pedro, FTC, or FTC Inverted, then Inches or Tiles. The field image remains fixed:

| Frame        | Origin      | Positive X | Positive Y | Zero Heading |
| ------------ | ----------- | ---------- | ---------- | ------------ |
| Pedro        | Bottom-left | Right      | Up         | Right        |
| FTC          | Center      | Down       | Right      | Down         |
| FTC Inverted | Center      | Up         | Left       | Up           |

Headings are counterclockwise-positive degrees. Choose the frame appropriate to your field orientation; the visualizer does not infer alliance or season orientation.

**Inches per Tile defaults to 23.5 and is editable.** The STEP assembly linked by [FIRST’s field-resources page](https://ftc-resources.firstinspires.org/ftc/field) models an interior tile repeat spacing of approximately 23.502 inches. FIRST’s nominal 24-inch description is not an exact assembled seam pitch. Measure your assembled field and adjust the calibration if needed; previously saved values are preserved.

The calibration controls the physical scale of the field image, grid, snapping, and tile coordinates together. In a centered FTC frame, `(2, 2)` at 23.5 inches per tile is 47 inches along each axis and lands on the matching visible seam intersection. Grid presets subdivide a tile, so switching between inches and tiles changes labels rather than the physical grid or image scale. Images must contain the full six-by-six tile layout, including custom images.

The inherited 141.5-inch field boundary stays fixed for project compatibility, centered at 70.75 inches. The six-tile image is centered inside it and clipped when larger; when smaller, a narrow margin surrounds the image. This is a compatibility model, not an exact reconstruction of every physical perimeter. With Inches selected, calibration preserves paths, field points, and custom obstacle geometry in physical inches. With Tiles selected, changing inches per tile preserves their tile coordinates in the selected frame, including control points, through points, and facing-point targets. Untouched built-in outlines follow the same centered image scale, and collision detection uses those exact displayed polygons.

Point editors, heading editors, robot position, grid/snapping, ruler, and path length follow the selected frame or units as applicable. Robot dimensions and motion-parameter settings remain in inches. Switching frame or units preserves the physical path. Changing tile size while Tiles is selected preserves tile coordinates and updates the underlying inch positions; with Inches selected, physical positions stay fixed. Robot dimensions and motion settings are never rescaled. Saved `.pp.json` projects retain these preferences alongside canonical Pedro-inch geometry.

## Why the default is 23.5 inches

The default is a practical rounding of a **measured CAD tile repeat of 23.502083 inches**, not the result of dividing the field boundary by six. The difference is about 0.0021 inches per tile. The inspected BIOBUZZ STEP assembly also measures approximately 141.170 inches between the lower-rail inner extents, 141.348 inches between the inner wall-panel faces, and 24.3125 inches across an uncut tile including its interlocking tabs. These are different measurements; a nominal tile width or tab-tip width is not its assembled repeat spacing.

Primary references:

- [FIRST Playing Field Resources](https://ftc-resources.firstinspires.org/ftc/field): source index for the BIOBUZZ CAD and setup documentation.
- [Official STEP assembly download (ZIP)](https://ftc-resources.firstinspires.org/ftc/field/field-cad-step) and [official Onshape assembly](https://cad.onshape.com/documents/a355e772e3d24813de7852ee/w/f106353168f1f92100b81259/e/95d1e1e442b4138cccaf2d73): the model inspected for these measurements.
- [FTC Competition Manual, §9.1–9.2](https://ftc-resources.firstinspires.org/ftc/archive/2027/game/manual-09): identifies CAD as the official geometry reference and describes the field and tiles as approximately 144 inches and nominally 24 inches, respectively.
- [Event Field Setup Guide, §7.2–7.4](https://ftc-resources.firstinspires.org/ftc/field/eventfieldguide): explains tile-size variation and measuring before trimming the outside tiles.

The [measurement record](docs/ftc-cad-measurements.json) includes the downloaded archive’s SHA-256, STEP header timestamp, units, and measurement method. It describes one CAD assembly, not a guarantee for every tile batch or assembled field. The editable calibration is intentional. The 141.5-inch software boundary remains a compatibility convention, not a claim of exact CAD dimensions.

## Obstacles and collision alignment

BIOBUZZ and DECODE built-in outlines use the same centered image calibration as the field art. They are plan-view approximations traced against the field images, not complete 3D CAD collision meshes. BIOBUZZ HIVE outlines intentionally cover the fixed outside bars rather than the elevated tipping cells or the open floor beneath them.

New/reset built-ins follow changes to Inches per Tile. Unmodified legacy default polygons are recognized and upgraded when loading; custom or edited polygons keep their physical coordinates when loading and follow the selected-unit calibration behavior described above when changing tile size. Editing a built-in vertex detaches that outline from automatic calibration. Names and colors may be changed without detaching it. Project saves and session recovery retain this distinction. Opening a project with linked built-ins also selects their matching field image.

The drawn outline and collision engine share one calibrated polygon list; the path optimizer receives it too. Robot dimensions remain in physical inches, and Safety margin expands the robot footprint for collision checks rather than changing the obstacle outline. Wall checks continue to use the fixed 141.5-inch boundary. Calibrating the image does not make these approximations a substitute for checking robot clearance against the actual field.

## Export Safely

The points-array export uses the selected coordinates and distance units. Java and Kotlin robot-code exports intentionally remain in **Pedro coordinates and inches**, so exports use the recalibrated inch positions after a tile-size change in Tiles mode. Do not treat a tiles/FTC points array as Pedro-inch coordinates without conversion.

The centered frames use half this visualizer's 141.5-inch field, not the 72-inch offset used by some Pedro FTC-coordinate conversions. If using those SDK conversion helpers directly, reconcile the field-center convention rather than copying displayed coordinates without checking it. Test start pose, axes, heading, and a short path on the physical robot before autonomous use.

## Develop and Verify

Use a current Node.js release compatible with Vite (validated with Node 24) and pnpm (the pinned version is recorded in `package.json`).

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm check
pnpm lint
pnpm build
pnpm test:e2e
pnpm dev
```

Regression tests cover all frame/unit round trips, custom tile sizes, heading conversion, point editing, centered snapping, export, and project persistence. A useful manual check is an FTC path from `(0, 0)` to `(1, 0)` in tiles: it should extend downward by 23.5 inches with the default tile size. Switching to Pedro/inches should show `(70.75, 70.75)` to `(70.75, 47.25)` without moving that path.
