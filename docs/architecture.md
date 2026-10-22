# Visualizer architecture: restructuring plan

Status: draft for review · Baseline: `main` @ `f953ee0` · Oct 2026

## Context: what 2.5 is for

**Visualizer 2.5** is a stopgap. It replaces Visualizer 2 while **Visualizer 3**, a ground-up
rewrite modeled on FRC tools like PathPlanner and Choreo, is built in parallel. v3 will take a
while, so 2.5 needs to be good enough to be what teams use in the meantime. That gives three
goals, in priority order:

1. **Ship user-visible improvements soon.** That means fixing the bugs, cutting the clutter and
   matching the Pedro look. 2.5 is not a rewrite.
2. **Invest only where the work carries over to v3.** File format and migrations, path geometry,
   simulation, codegen, tests and design tokens are all worth doing properly. Anything tied to
   2.5's UI is not, because v3 replaces it.
3. **Don't make v3's job harder.** 2.5 must not invent file-format features that v3 would then
   have to support forever.

Every phase below is labeled **→ v3** (portable, do it properly) or **2.5 only** (keep it cheap).

## TL;DR

- **Restructure 2.5 instead of rewriting it.** v3 is where the rewrite happens. About a third of
  this code is good and should be kept: codegen, path-tree operations, the time calculator, most
  of the heading math and the scene builders. The problem is the layer that holds state, plus a
  few math paths that disagree with each other.
- **The portable core is the main long-term deliverable.** `model/`, `sim/`, `io/` and `codegen/`
  are plain TypeScript with no Svelte or DOM imports, enforced by lint. Together with their test
  fixtures they're something v3 can import directly, or at least use as a reference
  implementation and conformance suite.
- **The core problem:** no part of the app owns state outside `App.svelte`. Document state is
  `$state` in App and gets handed down through `bind:` chains up to three levels deep
  (App → Navbar → FileManager). Children change it in place, and undo, dirty-tracking and
  autosave are kept in sync by hand. Every new feature gets wired into App. That's why it grew
  from 2,724 lines to 3,138 after the `modernize` refactor.
- **The fix:** a runes-based `ProjectStore` that owns the document and changes it only through
  commands. Add one load/migrate pipeline, one `Curve` abstraction that every consumer uses,
  and one "workspace" model in place of the three parallel path modes.
- **Delivery:** phases on a `v2.5` branch of the fork, each one leaving the app working, then one
  upstream PR (see "2.5 scope" in §3). Decisions are recorded in §4.
  Phase 0 is a test harness, because right now there are no tests and CI only deploys.

---

## 1. What's there now

About 18k lines of Svelte 5 and TypeScript. The field is drawn with **Two.js (SVG)**. d3 is only
used for two `scaleLinear` calls.

### Keep (mostly as is)

| Module | Why it's good |
|---|---|
| `lib/codegen/*` | Clear pipeline: model → IR → emit → format. Language strategy pattern, all Pedro API strings in one table. The cleanest code in the repo. |
| `utils/pathTraversal.ts` | Pure, immutable tree operations on `Path` (group, ungroup, move, locate, flatten). Well documented. |
| `utils/timeCalculator.ts` | Pure trapezoidal motion profile and timeline. |
| `utils/headingInterpolation.ts` | Pure. Piecewise headings and validation. Needs a small fix (it re-normalizes on every evaluation). |
| `utils/normalize.ts`, `utils/project.ts` | The legacy normalization logic is correct. It just gets called from four places. |
| `lib/scene/*`, `lib/canvas/pointRefs.ts` | Reasonable builders. Replaced in phase 5, but they're a useful reference. |
| `lib/pen/strokeFitting.ts`, `lib/export/gifExport.ts`, `lib/optimizer/*` | Fine apart from some dead parameters. |
| `components/ui/*` (Modal, NumberField, CollapsibleSection, StatCell, toast) | Good primitives that aren't used enough yet. |

### Structural problems

1. **No state owner.** About 60 pieces of state live in `App.svelte`: document, selection, tools,
   playback, layout, dialogs, assets and the multi-path caches. 10 document fields are bound
   two-way into Navbar, which passes them on to FileManager, which overwrites them on load.
   ControlTab binds 8 more and passes them further down.
2. **Undo depends on remembering to call it.** `recordChange()` is called by hand from about 25
   places in App, ControlTab and Navbar. File loads, session restore and settings edits don't
   record anything. `settings` *is* part of the snapshot, which means panel-width changes end up
   on the undo stack.
3. **Three path modes are handled everywhere.** Single, dual (marked deprecated but still active)
   and multi-path each have their own state: `secondLines` and friends, plus
   `additionalPaths`/`activePaths`. Nearly every feature branches on them: rendering, timing,
   GIF export, saving and robot poses.
4. **Curve geometry disagrees with itself.** For paths with `throughPoints`, `lineCurvePoints`
   returns a polyline sampled at 20 points per span:
   - The **renderer** draws it as a polyline.
   - **Animation, ghost/onion layers, GIF export and the optimizer** feed the same list to
     `getCurvePoint` as the control polygon of a degree-N Bézier.
   - So the robot doesn't follow the drawn curve.

   There are related mismatches:
   - Animation uses distance fraction as the Bézier parameter `t` (`animation.ts:236`).
   - Heading is evaluated in four places, one of them in pixel space.
   - Arc length has three caches.
   - The motion profile is implemented twice.
5. **Loading is duplicated.** FileManager, the session snapshot, App's upload handler and the
   multi-path loader each parse and normalize in their own way. Some skip
   `normalizeLegacyFieldMap` and some inline the `deriveSequence` fallback. What gets *saved*
   depends on the caller: FileManager leaves out `settings`, App includes it, and
   `downloadTrajectory` leaves out `version`.
6. **Rendering is imperative and sits inside reactive code.** A `$derived` builds Two.js objects.
   Other `$derived`s then write into its registry. An effect `void`s a hand-maintained list of
   dependencies and calls `two.clear()`, then re-adds everything on every frame. Dragging writes
   into `$state` proxies through the registry and then forces `lines = [...lines]`.
7. **Smaller issues of the same kind:**
   - three keyboard systems (hotkeys-js, a raw keydown listener, Navbar's own)
   - a `window` CustomEvent bus (`save`, `saveDualPath`, `fileRenamed`)
   - `alert()`/`confirm()` mixed with toasts
   - `svelte/legacy` `run()` in 7 files
   - a startup `setTimeout(500)` "to stabilize"
   - perf logging that's on by default and prints to the console every 2 s

### Bugs found along the way

These are worth fixing on their own, whatever happens with this plan.

- [x] Robot animation doesn't follow through-point curves (problem 4 above).
- [x] `selectedLineIndex = lines.length - 1` assigns to a `$derived` (`App.svelte:1651`), so the
      selection doesn't update after a double-click.
- [x] `commitPenStroke` and `createPathBetweenSelectedPoints` use a top-level `findIndex`, which
      returns -1 for paths nested in a group.
- [x] Loading a file doesn't reset or record history, so undo after a load can jump back into the
      file that was open before.
- [x] Panel resizing and settings edits go on the undo stack.
- [x] Mirror-duplicate (`FileManager.svelte:787`) doesn't mirror `throughPoints` or obstacles.
      Its rule (`FIELD_SIZE - x`, `180 - deg`) already matches Pedro 3.0.2's `mirrorX(70.75)`
      (decision 3). Only the parts it skips are wrong.
- [x] `DEFAULT_SETTINGS.experimentalFeatures` doesn't include `obstacles`.
- [x] `perf.ts` is enabled by default.
- [x] The session snapshot leaves out `fieldPoints` and the multi-path list.

---

## 2. Target architecture

```
src/
  model/        pure: types, path-tree ops, Curve, heading, mirror. No Svelte, no DOM.
  sim/          pure: timeline + poseAt(t). Inches only, no scales.
  io/           parse → migrate → normalize; serialize; FileStore adapters
  codegen/      (moved from lib/codegen, unchanged)
  state/        *.svelte.ts rune modules: project, history, selection, playback, prefs, workspace
  view/         viewport transform, SVG scene components, tools (select/drag, pen, coordinate)
  ui/           panels, dialogs, primitives
  App.svelte    layout shell only (target < 200 lines)
```

**Dependency rule:** `ui → view → state → {sim, io, codegen} → model`. Nothing below `state/`
imports Svelte, and `model/` and `sim/` are 100% unit-testable. This can be enforced with an
ESLint `no-restricted-imports` rule for each folder.

### 2.1 State: separated by lifetime

The current code treats all of these the same way. They have different lifetimes, so they should
live in different places.

| Kind | Examples | Undo? | Persisted where |
|---|---|---|---|
| **Document** | startPoint, paths, sequence, shapes, fieldPoints, robot/motion config | yes | the `.pp` file |
| **Session** | selection, active tool, playhead, open file id | no | session snapshot |
| **View** | grid, snap, ruler, protractor, panel widths/visibility | no | prefs (localStorage) |
| **Prefs** | field map, robot image, onion/ghost styling, experimental flags | no | prefs (localStorage) |

Robot and motion parameters (velocities, size) count as **document** state because they change
timing and codegen. This is decision 1.

### 2.2 `ProjectStore` and commands

```ts
// state/project.svelte.ts
export class ProjectStore {
  #doc = $state.raw<ProjectDoc>(emptyDoc());     // immutable value; replaced, never mutated
  readonly history = new History<ProjectDoc>();  // stores references, not JSON clones

  get doc() { return this.#doc; }
  dirty = $derived(this.#doc !== this.#savedRef);

  apply(cmd: Command) { const next = cmd(this.#doc); if (next !== this.#doc) { this.history.push(this.#doc); this.#doc = next; } }
  begin() / preview(cmd) / commit() / cancel()   // transactions: a drag is one undo step
  load(doc: ProjectDoc) { this.history.reset(); this.#doc = doc; this.#savedRef = doc; }
}
```

- **The document is an immutable value** (`$state.raw`). `pathTraversal.ts` already does
  immutable updates (`updatePath`, `replaceSegment`, `movePath`), so most commands are a few
  lines wrapping those.
- **Undo becomes structural.** History keeps the previous document *reference*: no
  `JSON.stringify`, no 200 deep clones, no hash dedupe. Every command is undoable automatically,
  so `recordChange()` goes away.
- **Dirty tracking** becomes reference comparison against the last saved document. This replaces
  the current effect, which only watches top-level references.
- **Drag** uses `begin()`, `preview()` on each pointer move and `commit()` on pointer up. That
  gives one undo step per drag, and nothing writes into proxies.
- **Components stop binding the document.** They read `project.doc` and call commands, for
  example `project.apply(setHeading(pathId, h))`. Navbar, FileManager and ControlTab lose about
  20 `$bindable` props between them.
- Stores are provided via `setContext` in App, not as module singletons, so tests and a future
  second editor instance can create their own.

Commands live in `model/commands.ts` as pure `(doc, ...args) => doc` functions. That means they
can be unit-tested without Svelte.

### 2.3 Workspace replaces the three path modes

```ts
interface Workspace { primary: ProjectStore; overlays: OverlayDoc[] }  // overlays: read-only, own color
```

- "Multiple paths" means: show other saved files as read-only overlays with their own robots on
  a shared clock.
- Dual mode is **deleted**. Its one extra capability, editing the second file, becomes "switch
  which file is primary".
- Rendering, timing, GIF export and pose sampling all take `Doc[]` and loop over it. That
  removes the `second*` and `additional*` branches across App (≈400 lines).

### 2.4 One curve, used by every consumer

```ts
// model/curve.ts
interface Curve {
  controlPoints: readonly BasePoint[];
  length: number;
  pointAt(s: number): BasePoint;   // s = arc-length fraction 0..1
  tangentAt(s: number): number;    // degrees, from the analytic derivative
  parameterAt(s: number): number;  // the Bézier t, for the "current t" readout
  sample(n: number): BasePoint[];  // GIF frames, high-degree rendering
}
curveOf(start: BasePoint, path: AtomicPath): Curve
```

- **Every segment is a single Bézier, as in Pedro.** A path with through-points is the curve
  Pedro's `Paths.through` builds: one Bézier of degree n−1 that passes through the points at
  evenly spaced t (`BezierCurve.through`). It is *not* a Catmull-Rom spline, which is what 2.0
  drew.
- Positions and headings are addressed by arc-length fraction `s`, matching Pedro:
  - The follower advances by distance.
  - Linear, constant and piecewise rules use path completion.
  - Tangent and facing-point read the curve at the robot's position.
  - Group overrides use completion across the whole group, as Pedro's `CompoundCurve` does.
- **Caching:** curves are cached by coordinates for now, because paths are still edited in place.
  Phase 3's immutable document allows a `WeakMap` keyed on the path object.
- **Rendering:** `lib/scene/stroke.ts` turns a curve into what the renderer draws. Degree 3 or
  lower becomes a native cubic; higher degrees are sampled. A property test checks every
  simulated position against that stroke.
- **Heading:** computed in one place, `segmentHeadingAt` in `utils/headingInterpolation.ts`, with
  the motion profile in `sim/motionProfile.ts`. The copies in `animation.ts` are deleted.

### 2.5 Simulation

```ts
// sim/index.ts
buildTimeline(doc): Timeline          // from timeCalculator.ts, keeps the existing trapezoidal profile
poseAt(doc, timeline, t): Pose        // inches + radians; no d3 scales, no pixels
```

`animation.ts` (765 lines) is split up:

- the pose math becomes `sim/`
- ghost and onion layers become `model/sweep.ts`
- the rAF controller becomes `state/playback.svelte.ts` (about 60 lines: `playing`, `t`,
  `loop`, `seek`)

### 2.6 I/O

```ts
// io/project.ts
parseProject(text: string): Result<ProjectDoc, LoadError>   // JSON → migrate → normalize → validate
serializeProject(doc: ProjectDoc): string                    // the only writer
```

- **Migrations are explicit:** `migrations: Array<{ from: string; up(raw): raw }>`, run in order
  from the file's `version`. The current implicit normalization becomes the migration for files
  from before 1.5. Files newer than the app still trigger `newerVersionWarning`.
- **Fixtures:** collect real `.pp` files from every version we can find into
  `test/fixtures/projects/`. Loading each one and round-tripping it is a test.
- **`FileStore` interface:**
  `list / read / write / rename / delete / duplicate`. Implementations:
  - `LocalStorageFileStore`: the current `pp_files` blob, so existing users keep their files.
  - `FsAccessFileStore`: the File System Access API.
  - Later, `IndexedDbFileStore` for quota relief, since base64 images in a single localStorage
    blob will eventually fail.
- All mirroring moves to one `model/mirror.ts` that covers paths, through-points, headings and
  shapes. Codegen keeps emitting `mirrorX` (decision 3), and a golden test makes sure the two give
  the same result.

### 2.7 View and interaction

- **Viewport** (`view/viewport.svelte.ts`) holds the field-to-screen transform and its inverse,
  plus snap. It replaces d3 `scaleLinear`.
- **Rendering moves to Svelte-rendered SVG.** Each path, point and obstacle is a keyed component
  that reads the store. Svelte only updates the attributes that changed. That removes Two.js, the
  manual dependency list, the `clear()`-and-re-add loop and `elementsFromPoint` hit testing, which
  becomes ordinary `onpointerdown` on the element. The scene is a few hundred nodes at most,
  which is well within what Svelte handles. Field points stay on a canvas.
- **Tools** are a small state machine: `select | pen | coordinate`. Each tool is a module with
  `pointerdown/move/up`, `keydown` and an overlay snippet. The 285-line `onMount` closure goes
  away.
- **Keyboard:** one `shortcuts.ts` table (`{ keys, when, run }`) dispatched by a single listener.
  hotkeys-js is removed.
- **Feedback:** one toast/confirm service. `alert()`, `confirm()` and the `window` CustomEvent
  bus go away; dialogs return promises.

### 2.8 UI: less clutter

**Where the clutter comes from.** Clutter isn't caused by having too many features. Every control
is visible all the time, whatever the user is doing, and many controls appear in two places.
Counted from the components:

- **Top bar: about 17 controls.** File name, time and distance, Optimize All, undo and redo, five
  view toggles, two panel toggles, Multiple Paths, Load, a Save menu, an Export menu, Reset,
  Settings, and the GitHub link.
- **Field toolbar: 7 buttons.** Add Path, + and - control point, Create Path to Last Point,
  Coordinate, Pen, and Play.
- **Right panel: everything stacked at once.** Obstacles, start point, robot position, path
  inspector, point editor, heading controls, group inspector, and playback.
- **Controls that appear twice:**
  - Play/pause: toolbar and playback controls.
  - Elapsed and total time: top bar and playback controls.
  - Ungroup: left rail and group inspector.
  - Remove control point: toolbar and point editor.
- **Settings mixes two kinds of thing.** Robot and motion parameters, which affect the path, sit
  next to cosmetic preferences such as onion-layer color and arrow thickness.

**Target layout:**

```
┌──────────────────────────────────────────────────────────────────────┐
│ ≡ File ▾  auto_left.pp •      ↶ ↷                Export ▾   ⚙        │  top bar: 6 controls
├────────────┬─────────────────────────────────────────┬───────────────┤
│ LAYERS     │                              [▦ ⌖ 📐 ⊾] │ INSPECTOR     │  view toggles live on
│ ▸ Paths    │  ┌ tools ┐                              │ (whatever is  │  the field corner
│   Path 1   │  │ ↖ ✎ ⌖ │                              │  selected)    │
│   ▸ Group  │  │  +    │          field               │               │  tools: select, pen,
│ ▸ Obstacles│  └───────┘                              │               │  coordinate, add path
│ ▸ Overlays │                                         │               │
├────────────┴─────────────────────────────────────────┴───────────────┤
│ ▶ ⟲  ━━━━━━━━●━━━━|━━━━━━|━━━━━━━  1.8s / 6.2s · 142 in              │  one playback bar
└──────────────────────────────────────────────────────────────────────┘
```

1. **Top bar: document actions only.**
   - A File menu holds New (which replaces Reset), Open, Save, Save As, Download, Import and
     Duplicate mirrored.
   - Undo/redo, Export and Settings stay on the bar.
   - The GitHub link moves to Settings → About. Optimize All moves to the command palette.
2. **View toggles move to a small overlay on the field.** Grid size, snap, ruler and protractor
   affect what's shown on the field, so the controls go next to it.
3. **The field toolbar holds tools only:** Select, Pen, Coordinate and Add Path.
   - Adding and removing control points becomes contextual: right-click a path or point, or use
     the inspector.
   - "Create path to last point" goes into that same context menu.
   - This lines up with the tool state machine in §2.7.
4. **One playback bar under the field.** It has play, loop, scrub, the per-path markers, time
   and distance. It replaces all three places that show playback or time today.
5. **The inspector shows only the current selection.**
   - **Nothing selected:** document properties, meaning the start pose plus robot and motion
     config, which now lives in the document (decision 1).
   - **A path, point or group selected:** only that editor.
   - **Piecewise heading:** collapsed until chosen.
   - **Robot position readout:** a small label on the field at the playhead.
6. **The left rail becomes a layers panel.**
   - The Paths tree is there as it is today.
   - Obstacles move there from the inspector and stay behind their flag.
   - **Overlays** replace the Multiple Paths dialog (from §2.3). Each overlay can be toggled and
     shows its color.
7. **Add a command palette (⌘K).** It runs off the same command and shortcut table as §2.7, so
   rarely used actions stay reachable without a button: Optimize All, curve-through, mirror,
   export PNG/GIF, and toggling experimental flags. Each action is listed with its shortcut.
8. **Settings only holds preferences.** Robot and motion config moves out. The remaining
   cosmetic options go into two sections, Display and Advanced. Experimental flags go at the
   bottom, collapsed.

**Rules to keep the clutter from coming back:**
- **Every action has one home.** It can be reached a second time only as a shortcut or a palette
  entry, never as a second button.
- **Context decides what's shown.** Controls for something that isn't selected stay hidden.
- **A new feature goes into the palette first.** It gets a permanent button only once people are
  clearly using it, or through a deliberate decision.

**What to measure:** the number of controls that are always visible. Today it's about 30 between
the top bar and the field toolbar, without counting the panels. The target is 12 or fewer.

### 2.9 Visual style: match the Pedro family

The docs (pedropathing.com, built with Fumadocs) and AutoTune's `web-tuner` already look the same.
They have nearly identical tokens: the same neutrals, the same translucent borders, the same pink
radial glow, and one hot-pink accent used sparingly. The visualizer is the odd one out:

- It is dark-only and hard-coded with `<html class="dark">`.
- It has three competing accents: purple for active, green for the slider and selection, blue for
  the toolbar.
- Its `--ui-*` vars aren't registered with Tailwind, so most colors are raw hex.
- It ships Poppins, and the `font-poppins` class on `<body>` doesn't resolve to anything.

**Tokens.** Adopt the shared set and use the same names as AutoTune, so its class strings carry
over directly:

```css
@custom-variant dark (&:where(.dark, .dark *));
@theme {
  --color-primary: #fe55a2;            /* official brand pink (docs). AutoTune uses #fe52a0; standardize on this */
  --color-danger: #e60026;
  --color-accent-foreground: #fafafa;
  --font-sans: "Instrument Sans Variable", ui-sans-serif, system-ui, sans-serif;
}
:root { --base: #fafafa; --surface: #fefefe; --border: #99999933; --body: #737373; --heading: #030303; }
.dark { --base: #0f0f14; --surface: #16161c; --border: #80808033; --body: #999999; --heading: #fafafa; }
@theme inline { --color-base: var(--base); --color-surface: var(--surface); --color-border: var(--border);
                --color-body: var(--body); --color-heading: var(--heading); }
```

`--surface` is new. The visualizer has layered panels, which neither sibling has. The dark value
is my pick and needs a visual check. The glow gradient (`--gradient-base`) comes from AutoTune
unchanged.

**What to take from the siblings:**
- **Color:** one accent. Pink is for selection, the active tool, focus rings, primary actions and
  the playhead. Everything else is neutral. Red is only for destructive actions. This replaces
  the purple, green and blue.
- **Type:** Instrument Sans, which is the docs font, self-hosted via
  `@fontsource-variable/instrument-sans`. Drop the four Poppins TTFs. Numbers in inspectors and
  readouts use `font-mono tabular-nums`, as AutoTune's results do, so values don't jitter while
  dragging.
- **Surfaces:** panels are `bg-surface/80 border border-border backdrop-blur`, with `shadow-sm`
  at most. This replaces the `console-panel` gradients and inset highlights.
- **Inputs:** the AutoTune input and boolean-row styles (`rounded-xl`, `focus:ring-primary/20`,
  `has-checked:border-primary`), at a smaller size.
- **Icons:** Lucide (`@lucide/svelte`), which both siblings use. It replaces the local icon set
  and the inline SVGs in Navbar and FileManager.
- **Code export:** Shiki with `github-light`/`github-dark`, which both siblings use. That also
  removes `svelte-highlight` and its version pin.
- **Theme:** light and dark, default dark, with a system option. This matches the docs
  (next-themes) and AutoTune (stored in localStorage under `theme`). Use the same `theme` key so
  the setting means the same thing in every Pedro app. The toggle lives in Settings and the
  palette, not the top bar (§2.8).
- **Brand:** put the duck mark (`logo-duck.svg`) at the left of the top bar, as the docs sidebar
  does. Restyle the MobileBlocked screen as AutoTune's "Computer required" card.

**What not to copy.** AutoTune is a one-task-per-screen wizard; the visualizer is a dense editor.
Take the tokens and treatment, not the proportions:

| | AutoTune | Visualizer |
|---|---|---|
| Card / panel radius | `rounded-3xl` | `rounded-2xl` for panels, `rounded-lg` for controls |
| Buttons | full-width pills, `py-3` | pills only for primary actions and toggle chips; icon buttons `size-8` |
| Padding | `p-8`–`p-10` | `p-3`–`p-4` in panels, `gap-2` between controls |
| Headings | `text-4xl`–`text-6xl` | `text-sm font-semibold` section titles; no large type in the editor |

**The field is special.**
- **Field images:** these are the same in both themes. Overlays drawn on the field (grid,
  ruler, protractor, labels) need a fixed high-contrast treatment that doesn't change with the
  theme, for example white with a dark halo.
- **Path colors:** use a fixed categorical palette with no pink in it. Pink is reserved for
  selection, so a selected path is pink and every other path keeps its own color. Today each path
  gets a random color in `normalize.ts`.
- **Robot heading arrow and playhead:** pink, to match.

**Implementation.**
1. **Phase 2a:** put the tokens in `app.css` and build the primitives on them: `Button`,
   `IconButton`, `Toggle`, plus the shared class strings in `ui/styles.ts` for inputs, surfaces
   and sections. A bridge section redraws the 2.0 class names (`console-*`, `panel-box`, …) on
   the tokens, so the current UI picks up the palette without its markup changing.
2. **Phase 7:** each rebuilt component uses the primitives and drops its bridge classes and
   hard-coded hex values. The light theme is switched on once nothing depends on the bridge;
   2.0's dark-only markup can't be themed from a stylesheet.
3. Long term, if several Pedro web apps keep sharing these tokens, they could live in one shared
   CSS file. For now the tokens are copied, and 2.5 moves to the shared component library once
   it's ready (decision 10).

### 2.10 Collision checks

These are experimental and behind `experimentalFeatures.obstacles`. All of it is pure code in
`model/collision.ts`, so it goes to v3 along with the rest of the core.

- **Footprint.** At each pose, the robot is a rectangle `rWidth × rHeight` rotated to the
  heading and inflated by `safetyMargin`. `geometry.getRobotCorners` already computes this.
- **What gets checked:**
  - **Obstacles** (`Shape`). Their vertices can form non-convex polygons, so the test is
    footprint–polygon edge intersection plus containment, either way round. That doesn't need
    SAT.
  - **Field walls** (`0..FIELD_SIZE`).
  - Robot overlays (§2.3) are left out for now.
- **Sampling.** Walk the sim timeline in arc-length steps no bigger than half the footprint's
  short side, so that no obstacle can fall between samples. Rotations in place are sampled by
  angle. Consecutive hits are merged into intervals:
  `{ pathId, shapeId | "wall", tStart, tEnd }`.
- **Cost.** The result is memoized on the immutable `ProjectDoc` reference (§2.2), so it
  recomputes once per edit and not once per frame. While dragging, it runs on the preview
  document with a coarser step, then exactly on commit. If that's still too slow, it moves to a
  Web Worker. The core is pure, so moving it is cheap.
- **UI:**
  - **Field:** the colliding stretch of a path gets a red tint, and the footprint is outlined at
    the first contact.
  - **Playback bar:** red bands at each interval, and clicking one seeks there.
  - **Layers panel:** a count badge on each affected path.
  - **Palette:** a "Jump to next collision" command.

---

## 3. Migration plan

**Branching:** 2.5 is developed on a `v2.5` branch of the fork (`zachwaffle4/PedroVisualizer`)
and PR'd to upstream `Pedro-Pathing/Visualizer` as one PR when it's done. That makes it a large
PR, so:
- each phase lands on `v2.5` as its own reviewable commit or PR, with the app working at every
  step;
- `v2.5` regularly merges upstream `main` in, so v2 fixes from other contributors (like the LOAD
  and pen-tool work) don't pile up as one big conflict at the end.

### 2.5 scope

| Phase | Carries to v3? | Priority |
|---|---|---|
| 0. Safety net | **→ v3.** The fixtures and golden codegen tests become v3's conformance suite. | do |
| 1. I/O pipeline | **→ v3.** We own the format for now. v3 migrates from it later. | do |
| 2. Curve and sim | **→ v3.** Pure math. | do |
| 2a. Tokens and primitives | **Tokens → v3.** The Svelte primitives are 2.5 only and get replaced by the shared component library. | do (biggest visible win per hour) |
| 3. ProjectStore | **Commands → v3** (pure functions). The rune store is 2.5 only. | do (what makes 2.5 stable) |
| 5. View layer | 2.5 only | do: Two.js and d3 are dropped (decision 2) |
| 7. Decluttered layout | 2.5 only, but it previews v3's PathPlanner/Choreo-style layout. | do |
| 8. Collision checks | **→ v3.** Pure geometry over the sim. | do, behind the obstacles flag |
| 4. Workspace | 2.5 only | **cut down:** delete dual mode, keep multi-path as overlays, no redesign |
| 6. UI cleanup | 2.5 only | **folded** into 2a and 7 |

**Order:** 0, 1, 2, 2a, then 3, then 5 and 8 in parallel, then 7, then 4-lite. Phase 2a comes
right after the core work because nothing blocks it, and every component rebuilt later can then
be written against the new primitives once.

**Portable core as a package.** `model/`, `sim/`, `io/` and `codegen/` are kept free of app
imports from the start, so they can be moved into a workspace package (for example
`packages/core`) and published for v3, which is React and possibly Theia. That only works if
nothing in the core imports Svelte, the DOM, `config/` UI defaults or `$lib`. Lint enforces this
from phase 0. Whether to actually publish it is up to the maintainers.

### Phase detail

| Phase | Scope | Exit criteria | Size |
|---|---|---|---|
| **0. Safety net** | Vitest. Golden tests for codegen (Java/Kotlin × modes × mirror) over fixture projects. Load round-trip tests. CI runs `check`, `lint`, `test` and `build` before the Vercel deploy. Turn perf logging off. | CI is green and gates deploys. | S |
| **1. I/O pipeline** | `io/` with `parseProject`, `serializeProject` and migrations. Route all four loaders and all savers through it. Format `1.6.0` adds robot and motion config to the document (decision 1). The `FileStore` interface waits until a second backend (IndexedDB) needs it; until then `browserFileStore` is the only store. | One reader and one writer. Fixtures pass. | M |
| **2. Curve and sim** | `model/curve.ts`, `model/sweep.ts`, `sim/`. Point the renderer, animation, GIF, optimizer and codegen at them. Delete the duplicated math in `animation.ts`. | The robot follows the drawn curve, with property tests comparing render samples to sim samples. **This changes visible behavior on purpose**, so call it out in release notes. | M |
| **2a. Tokens and primitives** | The §2.9 tokens (both themes defined), Instrument Sans, Lucide, the Svelte primitives, the field palette and pink selection. The 2.0 components stay as they are: a bridge section in `app.css` redraws their class names on the tokens. Phase 7 rebuilds most of them anyway. | The app renders in the Pedro dark palette with no 2.0 component markup changed. | S |
| **3. ProjectStore** | `state/project.svelte.ts`, commands, structural history, transactions. Move document state out of App. Replace `bind:` chains with store reads and commands. | `recordChange` and `$bindable` document props are gone. App loses ~800 lines. | L |
| **4. Workspace** | Overlays replace dual and multi-path. Delete `second*`, `dualPathMode`, `secondFilePath`. | One code path for N robots. | M |
| **5. View layer** | Viewport, SVG scene components, tool state machine, shortcut table. Remove Two.js, d3 and hotkeys-js. | App is a layout shell under 200 lines. | L |
| **6. UI cleanup** | Toast/confirm service. Split FileManager into a list UI plus `FileStore`. Remove `svelte/legacy`. Use the shared icons. | No `alert`/`confirm`, no `run()`. | M |
| **7. Decluttered layout** | The §2.8 layout: File menu, view toggles on the field, tools-only toolbar with context menus, playback bar, selection-based inspector, layers panel, ⌘K palette, Settings split, opt-in auto-collapse. Restyle the surviving dialogs (Settings, Export, file manager, save/name dialogs) on the primitives. Then switch on the light theme and its toggle, Shiki for code export (removing `svelte-highlight`), and the duck logo. | No more than 12 always-visible controls. Every action has one home. The `app.css` bridge and the old `icons/` components are gone. Both themes look right. | L |
| **8. Collision checks** | §2.10: `model/collision.ts`, sampled over the sim timeline. Results show on the field, the playback bar and the layers panel. | Golden tests on fixture projects with known hits and misses. Recomputing doesn't drop frames while dragging. | M |

Phase 5 also changes two visible behaviors, for the release notes:

- GIF export paints frames from the sim over the visualization timeline, so GIFs now include
  the visualization waits after each path. Before, the GIF ran for the path time alone and cut
  the waits off.
- Robot poses are in field convention everywhere (inches, heading counter-clockwise). The
  screen-space `calculateRobotState` is gone, and the pose goldens flipped sign to match.

Phase 7 ships in two parts:

- **7a, layout and controls.** The §2.8 layout: top bar with a File menu, tools and view toggles
  on the field, a right-click menu, one playback bar, the selection-based inspector, the layers
  panel with overlays, the ⌘K palette, and one action table (`view/actions.ts`) behind the
  menus, palette and shortcuts. Robot and motion config move from Settings to the inspector.
  Always-visible controls: 5 on the top bar, 4 tools and 3 view toggles, for 12.
- **7b, style.**
  - Settings holds preferences only: Display, Advanced, and Experimental (collapsed), with
    About and Reset in the footer.
  - Opt-in auto-collapse.
  - Every dialog and inspector editor is rebuilt on the primitives. The `app.css` bridge and
    the old `icons/` are gone.
  - Light, dark and system themes, stored under `theme` and dark by default.
  - Shiki highlights exported code, loaded on first use.
  - The duck logo is in the top bar.
  - `alert`, `confirm`, `prompt`, the window event bus and `svelte/legacy` are replaced by
    `lib/dialog.ts`, a promise-based confirm and prompt host. That finishes phase 6.

Changes in 7a to call out:

- **New** clears the open file name, so the next save asks for one. Reset used to keep it.
- **Save** writes to the open file and only asks for a name when there isn't one yet.
- **Through-curves** run from the palette. The tension input is gone because it never changed
  the curve.
- **Duplicate mirrored** moved from the file manager to the File menu and works on the open
  project. It uses `model/mirror.ts`, which covers through-points, piecewise headings, obstacles
  and field points. `test/mirror.test.ts` checks it against exporting with `mirrorX`
  (decision 3).

Changes in 7b to call out:

- **File manager:**
  - Rename and New open a name dialog in place of the inline fields. This also fixes Enter
    renaming twice.
  - The open file is the selected one.
  - Escape no longer closes the drawer.
- **Piecewise headings:** the editor's segments start collapsed, one open at a time.
- **Heading arrow:** its toggle moved from the robot section to Settings, next to its length,
  color and thickness.
- **Image upload errors** show a toast in place of an `alert()`.
- **Field images draw at their true scale.** They show six 24" tiles (144"), so they now extend
  1.25" past the 141.5" floor on each side and get cropped. Before, they were squeezed into the
  floor, which made each tile 23.6". The default DECODE goal obstacles were re-traced to match,
  and an optional tile-seam overlay (Settings → Display) marks the seams at 22.75", 46.75" and
  so on.

Phases 1 and 2 don't depend on each other and can run in parallel. Phase 3 comes before 4 and 5.
Phase 8 needs phase 2 (sim) and is easier to show after 5. Phase 7 needs phase 3 (the commands
drive the palette and context menus) and phase 5 (tools). Some of 7 is just markup and can ship
early: the playback bar, the File menu, and removing the duplicate controls.
The open bugs from §1 can be fixed whenever convenient. The phase that touches each area deletes
the buggy code anyway, so fix them early only where users are hitting them now.

---

## 4. Decisions (2026-10-22)

1. **Robot and motion settings go in the `.pp` file.** This bumps the format to `1.6.0` with a
   migration. Older files have no robot config, so on load the migration fills it in from the
   user's current settings. That's what those files effectively use today, so their timing
   doesn't change.
2. **Two.js and d3 are dropped.** Phase 5 is back in scope, and the view layer becomes
   Svelte-rendered SVG as described in §2.7.
3. **Code export keeps Pedro's `mirrorX`.** Upstream fixed it in 3.0.2 to use `π − heading`.
   `model/mirror.ts`, which handles mirror-duplicating a file, has to match it exactly:
   x → 2a − x, heading → π − heading, applied to through-points, piecewise heading parameters
   (including facing-point targets) and obstacles too. A golden test checks the two against each
   other.
4. **Collision checks get built, for fun.** They stay behind the obstacles flag. See §2.10.
5. **Auto-collapse is an opt-in preference.** When it's on, the inspector hides when nothing is
   selected, and both panels hide while playing or drawing with the pen. It's off by default.
6. **Desktop only for now.** The `MobileBlocked` screen stays and gets restyled (§2.9).
7. **v3 is React, possibly on Eclipse Theia.** It doesn't affect 2.5 beyond keeping the core
   portable. Publishing that core as a separate package may be proposed later (§3).
8. **We own the format for now.** 2.5 can change it, using explicit versioned migrations. The v3
   format gets discussed separately, and files get migrated to it later. Keeping every change
   behind a migration and a fixture keeps that later migration straightforward.
9. **2.5 lives on a branch of the fork** and goes upstream as one PR when it's done (§3).
10. **Tokens are copied for now.** 2.5 moves to the shared UI component library, part of the v3
    groundwork, once it's ready. Until then, the 2.5 primitives stay thin: few props, all styling
    from tokens. That keeps the swap mechanical. The pink is standardized on the docs value,
    `#fe55a2`.

## 5. Still open

- The `--surface` dark value (§2.9) needs a visual check against both field images. 
- A target date for the upstream PR, if there is one. (ASAP)

## 6. General ground rules

1. **Avoid slop;** make code readable and maintainable, please.
2. **Comments describe state, not timelines.** Do not reference this conversation/plan or the previous 
   code in comments. They're also only necessary if the actual code itself isn't immediately intuitive, and they should be kept shorter when possible.
3. **Do not commit anything or otherwise publish anything to Git/GitHub.** That's my job as the human 
   reviewer!!!!! Always stop after every phase for a sanity check and let me commit things.
   Interacting with Git/GitHub to view history, other branches, existing issues/PRs, etc is allowed of course.