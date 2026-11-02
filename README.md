# Pedro Pathing Visualizer

c3: art; ans to 1

## Plan Pedro paths in FTC coordinates and tiles

Teams using FTC field coordinates can plan around the field center without translating every waypoint to a corner-based frame. This gives teams a common reference for targets and makes symmetry-based autonomous strategies easier to express. Tile units let students describe a waypoint as two tiles, half a tile, or a tenth of a tile, then switch to inches when needed. Java and Kotlin exports remain in Pedro inches.

These changes have three priorities: support documented FTC coordinates, make tile-based planning accessible to students, and keep the visualization aligned with measured field geometry.

### Use the documented FTC field frame

Open **Settings → Coordinates and Units**. Select Pedro, FTC, or FTC Inverted, then Inches or Tiles. The field image remains fixed:

| Frame        | Origin      | Positive X | Positive Y | Zero Heading |
| ------------ | ----------- | ---------- | ---------- | ------------ |
| Pedro        | Bottom-left | Right      | Up         | Right        |
| FTC          | Center      | Down       | Right      | Down         |
| FTC Inverted | Center      | Up         | Left       | Up           |

Headings are counterclockwise-positive degrees. Choose the frame appropriate to your field orientation; the visualizer does not infer alliance or season orientation.

[FIRST’s Field Coordinate System Definition](https://ftc-docs.firstinspires.org/en/latest/game_specific_resources/field_coordinate_system/field-coordinate-system.html) places the origin at the field center. From outside the red wall looking inward, +X is right, +Y is away from that wall, and positive rotation is counterclockwise from above. It also documents square fields with inverted alliance areas. The table above expresses those orientations relative to the visualizer’s fixed image; select the orientation that matches the field’s red wall. Zero heading here means facing +X.

A centered origin makes distances to the center explicit and avoids corner-offset arithmetic when reflecting a plan. It does not by itself improve localization accuracy or guarantee a more consistent autonomous run.

### Reuse an autonomous plan across symmetric sides

A team can define one canonical plan and transform it according to an alliance or starting-side selection. For example, **if the relevant game layout and route are symmetric across the FTC X axis**, reflecting Y maps `(x, y)` to `(x, -y)`. Reflect the heading too: `theta` becomes `-theta`. This is a team-defined strategy, not a universal red-to-blue rule; some layouts require reflecting X, rotating both axes, or planning different routes.

This standalone Java example uses tile positions and degree headings in the **FTC** frame. The enum holds the transformation signs, so the same waypoints can serve both selections:

```java
class AlliancePlan {
    enum Alliance {
        RED(1, 1), BLUE(1, -1); // Example only: assumes Y-reflection symmetry.

        final int xSign, ySign;
        Alliance(int xSign, int ySign) {
            this.xSign = xSign;
            this.ySign = ySign;
        }
    }

    record TilePose(double x, double y, double headingDeg) {}
    record PedroPose(double x, double y, double headingDeg) {}

    static TilePose forAlliance(TilePose pose, Alliance alliance) {
        double theta = Math.toRadians(pose.headingDeg());
        double heading = Math.toDegrees(Math.atan2(
            alliance.ySign * Math.sin(theta),
            alliance.xSign * Math.cos(theta)));
        return new TilePose(alliance.xSign * pose.x(),
                            alliance.ySign * pose.y(), heading);
    }

    // Matches this visualizer's FTC frame and retained 141.5-inch field model.
    static PedroPose toPedro(TilePose pose, double inchesPerTile) {
        double center = 141.5 / 2;
        return new PedroPose(center + pose.y() * inchesPerTile,
                             center - pose.x() * inchesPerTile,
                             pose.headingDeg() - 90);
    }

    static PedroPose targetFor(Alliance alliance, double inchesPerTile) {
        TilePose canonical = new TilePose(2, 1, 30);
        return toPedro(forAlliance(canonical, alliance), inchesPerTile);
    }
}
```

At 23.5 inches per tile, the canonical target is `(2, 1, 30°)` for RED and `(2, -1, -30°)` for BLUE. Converting once to Pedro gives `(94.25, 23.75, -60°)` and `(47.25, 23.75, -120°)`, respectively. Headings equivalent modulo 360° describe the same orientation. The sign formula also handles X reflection or a 180° rotation when the enum signs are chosen accordingly.

Apply the transformation consistently to the start pose, every endpoint, curve controls, through points, and facing-point targets. Reflection reverses rotation direction, so explicit turn choices must follow the reflected plan as well. Check that transformed routes and mechanisms suit the actual game geometry. The example illustrates robot-side planning; selecting an FTC display frame does not automatically generate alliance-selection code. Already-exported Java/Kotlin coordinates are Pedro inches and must not be converted a second time.

### Reason in tiles, switch to inches

Choose **Tiles** to enter whole or fractional tile coordinates: `0.5` is half a tile and `0.1` is one tenth. Choose **Inches** to inspect the same physical path in inches. Switching frame or units preserves the path. When Tiles is selected, changing Inches per Tile instead preserves the tile coordinates and recalculates their inch positions, keeping a waypoint on the corresponding tile intersection.

### Align planning with measured field geometry

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
