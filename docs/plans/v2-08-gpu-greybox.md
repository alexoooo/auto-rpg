# v2-08 — prove the GPU greybox and visibility boundary

**Goal:** render the current worker-owned legacy simulation through a procedural
Babylon greybox, with correct identity, authoritative fog, explicit backend fallback,
and honest foreground measurements.

**Status:** complete — proceed/pass with an owner-accepted measured exception. The
WebGPU p95 threshold failed; the missing ordered WebGL2 recapture and final Canvas2D
control were explicitly waived, not treated as completed protocol slots.

**Depends on:** `v2-07` is complete, including its worker protocol, root-hosted Vite
entry, and fixed three-buffer ownership contract.

**Golden expectation:** `LAB_HASH`, `GOLDEN_STATE_HASH`, `ROOM_HASH`, `BATTLE_HASH`,
`BOW_HASH`, and `SWAP_HASH` must not move. Rust changes are limited to exposing
presentation wire constants and teaching `emit_abi` to generate additive TypeScript
metadata for the existing layout. The session changes no Rust behavior, wasm export,
command, replay content, frame version, or hash domain.

## Reconciled current boundary

The renderer consumes `SimClient.onSnapshot` from
[`client/src/runtime/sim-client.ts`](../../client/src/runtime/sim-client.ts#L122).
It never imports `sim.worker.ts`, constructs wasm, or sends a float to simulation.
The arriving `SnapshotView` in
[`client/src/state/snapshot.ts`](../../client/src/state/snapshot.ts#L217) is a view
over a leased transferable buffer. The next publication returns and detaches the old
lease, so Babylon must not retain two `SnapshotView` objects for interpolation.

On every `onSnapshot` callback, synchronously decode and copy the complete disclosed
publication into a renderer-owned `PresentationSnapshot` made only of frozen plain
records and copied arrays. Only those immutable copies may become `previous` and
`current` interpolation inputs. Finish the copy before returning from the callback;
never retain a frame, map, VIS, or furniture view from the worker lease.

The worker already filters hidden state, but that is not permission for renderer
subsystems to bypass visibility. The renderer applies the same disclosure boundary
again before creating mesh, shadow, label, effect, audio, picking, or debug state.

## Landable implementation order and files

Implement in this order; each numbered step must typecheck and leave `/v2.html`
usable before the next begins.

1. Pure presentation copy, visibility, interpolation, and fixtures:

   ```text
   client/src/render/presentation.ts
   client/src/render/visibility.ts
   client/src/render/interpolation.ts
   client/src/render/stress.ts
   crates/web/src/bin/emit_abi.rs
   client/src/protocol/abi.generated.ts
   tools/check_abi.js
   client/test/render-contract.test.mjs
   ```

2. Backend selection and right-handed scene shell:

   ```text
   client/src/render/engine.ts
   client/src/render/scene.ts
   client/src/render/camera.ts
   client/src/render/debug.ts
   ```

3. Procedural environment and spatial presentations:

   ```text
   client/src/render/environment.ts
   client/src/render/actors.ts
   client/src/render/transients.ts
   ```

4. Input and page orchestration:

   ```text
   client/src/render/renderer.ts
   client/src/render/performance.ts
   client/src/render/canvas-control.ts
   client/src/bootstrap.ts
   client/src/input/greybox-input.ts
   client/src/v2.ts
   web/v2.html
   vite.config.ts
   ```

5. Evidence template and durable documentation reconciliation:

   ```text
   docs/performance/v2-reference-matrix.md
   docs/architecture/browser-runtime.md
   docs/architecture/assets.md
   docs/reference/frame-abi.md
   docs/reference/worker-protocol.md
   docs/documentation-inventory.md
   docs/performance/README.md
   docs/performance/v2-reference-matrix.md
   docs/performance/evidence/YYYY-MM-DD-v2-greybox-<backend>.json
   ```

Do not add `@babylonjs/loaders` in this session. The procedural greybox loads no GLB,
the package is currently absent from the lock and toolchain manifest, and an unused
loader would expand the audited dependency surface. Use the already exact and pinned
`@babylonjs/core` `9.18.1`. Import runtime symbols from leaf `.js` entries rather than
the `@babylonjs/core` root barrel. Add the loader, its exact toolchain pin, and lock
record only in the later session that first loads a glTF asset.

## Generated presentation ABI

Extend `emit_abi.rs` and regenerate `abi.generated.ts`; do not hand-copy offsets into
renderer modules. This is additive metadata for layout 7 and does not bump
`FRAME_LAYOUT_VERSION`. Emit every name below from the Rust layout/codes:

```text
RAW_ANGLE_TURN = 65536
MAP_TILE_MILLI = 1000
MAP_OPEN = 0
MAP_SOLID = 1
MAP_UNKNOWN = 255

UNIT_X = 0                 UNIT_Y = 1
UNIT_FACING_RAW = 2        UNIT_RADIUS = 3
UNIT_HP = 4                UNIT_MAX_HP = 5
UNIT_FACTION = 6           UNIT_KIND = 7
UNIT_INTENT = 8            UNIT_ENTITY_INDEX = 9
UNIT_ENTITY_GENERATION = 10
UNIT_LIMB_ANGLE_RAW = 11   UNIT_LIMB_REACH = 12
UNIT_LIMB_SPIN = 13        UNIT_ACTION_LENGTH = 14
UNIT_ACTION_ARC_RAW = 15   UNIT_HIT_FLASH = 16
UNIT_BLOCK_FLASH = 17      UNIT_PARRY_FLASH = 18
UNIT_LIMB_SWING = 19       UNIT_LIMB_SWING_LEFT = 20
UNIT_LIMB_LINE_RAW = 21    UNIT_ACTION_KIND = 22
UNIT_ACTION_ROLE = 23      UNIT_SLOT = 24
UNIT_SLOT0_ACTION = 25     UNIT_SLOT1_ACTION = 26
UNIT_SIGHT_RANGE = 27      UNIT_VISIBLE = 28
UNIT_VX = 29               UNIT_VY = 30
UNIT_STRIDE_PHASE = 31     UNIT_SWING_SPAN = 32

SHOT_X = 0                 SHOT_Y = 1
SHOT_HEADING_RAW = 2       SHOT_FACTION = 3

EVENT_KIND = 0             EVENT_X = 1
EVENT_Y = 2                EVENT_AMOUNT = 3
EVENT_ACTOR_INDEX = 4      EVENT_OTHER_INDEX = 5
EVENT_AUX0 = 6             EVENT_AUX1 = 7
EVENT_DAMAGE..EVENT_DESCEND = current public Rust event codes 0..10

FURNITURE_KIND = 0         FURNITURE_TX = 1
FURNITURE_TY = 2           FURNITURE_STATE = 3
FURNITURE_DOOR = 1         FURNITURE_TORCH = 2
FURNITURE_DOOR_SHUT = 0    FURNITURE_DOOR_OPEN = 1
TORCH_FACE_POS_X = 0       TORCH_FACE_POS_Y = 1
```

Make the existing Rust furniture wire constants and `TILE_MILLI` public where the
emitter needs their real value; generated `MAP_TILE_MILLI` is exactly an alias of
that `TILE_MILLI`, not a second tile-size authority. The current map publication is
only `u8::from(dungeon.solid(...))`: `MAP_OPEN` and `MAP_SOLID` are its only live
codes, while doors remain furniture. Do not invent or emit a map door code and do not
duplicate private numeric literals in TypeScript. Add the
Rust sentence test `generated_presentation_offsets_cover_every_packed_column` and
make `write_frame`, `write_unit`, and `write_furniture` index through the public Rust
semantic offset constants that the emitter imports. The Rust test must exhaustively
assert every offset array is exactly `0..STRIDE`, rather than checking only its first
and last field; extend `generated_abi_matches_rust_layout` to require every emitted name. The page
still reads `mapTileSizeMilli` from each snapshot; `MAP_TILE_MILLI` validates the
current fixture/default and is not substituted for arriving metadata.

## Renderer-owned snapshot contract

`presentation.ts` exports `copyPresentationSnapshot(message, view)`. Its structural
input names only the snapshot metadata and `SnapshotView`; it must not import any
worker implementation or `SimClient`. Return this frozen shape:

```ts
type PresentationSnapshot = Readonly<{
  epoch: number;
  tick: number;
  mapCols: number;
  mapRows: number;
  tileSize: number;
  mapRevision: number;
  visRevision: number;
  furnitureRevision: number;
  map: readonly number[];
  vis: readonly number[];
  units: readonly PresentationUnit[];
  shots: readonly PresentationShot[];
  events: readonly PresentationEvent[];
  furniture: readonly PresentationFurniture[];
}>;
```

Copy every scalar needed by greybox pose/debug presentation, not the whole capacity
tail. Convert raw binary-turn angles to renderer radians only in this copy. One sim
world unit remains one scene unit. Do not mutate the input typed arrays and do not
preserve a typed-array reference in the result.

Identity is exact by category:

- A unit key is `${entity_index}:${entity_generation}`. Reconcile actor nodes only by
  that pair. An absent key retires every node, shadow caster, label, pick registration,
  effect attachment, audio attachment, and debug record it owned. Reuse of an index
  with another generation creates a new presentation identity and never interpolates
  from the old body.
- Shots have no persistent handle in frame layout 7. Key them
  `${epoch}:${tick}:shot:${row}` and present them from one copied snapshot only. Do
  not match shots by position or row across snapshots.
- Events carry index hints, not generational identities. Key them
  `${epoch}:${tick}:event:${row}`. Never attach a persistent effect to an actor by the
  event's `actor_index` or `other_index`; a spatial event may create a bounded
  snapshot-local effect at its disclosed position.
- Furniture uses `${kind}:${tx}:${ty}` within an epoch. A record absent from the
  current disclosed furniture list is absent now, even if its tile is remembered.
  Do not retain a previously visible door state or torch record across that absence.

`interpolation.ts` accepts two `PresentationSnapshot` copies and a clamped `0..1`
alpha. `renderer.acceptSnapshot(copy, receivedAtMs)` receives a finite monotonic
`performance.now()` timestamp immediately after copying the lease. Its timeline is
exact:

- first snapshot or changed epoch: clear previous/current/transients, install the
  copy as both endpoints, and render it immediately with alpha 1;
- greater tick in the same epoch: previous becomes the old current, current becomes
  the new copy, receipt becomes `receivedAtMs`, and duration is
  `(current.tick - previous.tick) * (1000 / 60)` milliseconds;
- equal tick in the same epoch: this is an authoritative same-tick command
  publication; replace both endpoints and render immediately at alpha 1;
- lower tick in the same epoch, non-finite/backwards receipt time, or mismatched
  epochs passed directly to interpolation is a terminal renderer protocol error;
- otherwise alpha at render time is
  `clamp((nowMs - currentReceiptMs) / durationMs, 0, 1)`. A coalesced snapshot uses
  its actual tick delta exactly; `coalescedSnapshots` is diagnostic and never alters
  duration or fabricates intermediate state.

Interpolate only units whose complete identity occurs in both endpoints. Retire an
identity absent from the newer endpoint immediately. A new identity is withheld for
alpha less than 1 and appears exactly at alpha 1, preventing interpolation from
revealing a future endpoint or blending across generation reuse. Position, velocity,
radius, HP, and angles use explicit functions; raw-turn angles take the shortest
wrapped path and stride phase wraps modulo 1. Shots/events are current-snapshot-only,
and furniture/map switch on the authoritative current copy rather than interpolate.
Every operation is a pure read and never mutates either endpoint.

## Authoritative visibility and remembered geometry

`visibility.ts` is backend-independent and is the only function family that decides
whether a spatial renderer record may exist. Map a sim point `(x, y)` to tile
`floor(x / tileSize), floor(y / tileSize)` and fail closed for non-finite or
out-of-bounds coordinates.

Use these exact rules:

- `VIS === 0` or `map === MAP_UNKNOWN (255)`: no geometry, body, projectile, event,
  furniture, shadow, label, sound, pick target, or debug residue.
- `VIS === 1` with known map byte: remembered floor/wall/doorway topology may render
  in the remembered material. No unit, shot, event, furniture record, light, sound,
  effect, or pick target survives solely because the tile was seen before.
- `VIS === 2`: known geometry may use the current material. A unit additionally
  requires its disclosed `visible` field; a shot/event requires its disclosed point;
  furniture requires its disclosed `(tx, ty)` record. All must pass current-tile
  gating even though the worker already filtered their rows.

Return one explicit presence decision consumed by mesh, shadow, nameplate, effect,
audio, picking, and debug registries. No subsystem reimplements a looser check. Apply
the same decision on WebGPU and WebGL2.

## Exact backend selection and diagnostics

`engine.ts` keeps selection orchestration independent of Babylon and DOM behind
injected factories. The production adapter uses leaf imports:

```text
@babylonjs/core/Engines/webgpuEngine.js
@babylonjs/core/Engines/engine.js
@babylonjs/core/Engines/abstractEngine.js (type only)
```

The canonical query parameter is `backend=auto|webgl2`; absent means `auto`. For
tolerance of previously shared diagnostic URLs, `renderer=auto|webgl2` is an exact
alias, while conflicting `backend` and `renderer` values fail closed with a query
diagnostic. `renderer=canvas` remains the separate Canvas2D control. There is no
ambiguous `webgpu` force mode: an accepted WebGPU measurement requires diagnostics
to report that `auto` actually selected WebGPU.

For `auto`, `await WebGPUEngine.IsSupportedAsync`. Do not use synchronous
`IsSupported` and do not use `WebGPUEngine.CreateAsync`. If support is false, record
a support-stage failure and create WebGL2. If supported, construct
`new WebGPUEngine(canvas)` and `await engine.initAsync()`. On rejection, record the
sanitized error, dispose the partial engine, replace the canvas with a fresh element,
reattach orchestration/input to that replacement, then create WebGL2. A failed WebGPU
initialization may already have locked the first canvas to a `webgpu` context, so
fallback on the same element is forbidden.

Forced WebGL2 skips both WebGPU support and initialization. Explicitly acquire
`canvasno, ju.getContext("webgl2", attributes)`; null is a terminal renderer error. Pass
that `WebGL2RenderingContext` to `new Engine(...)` and require
`engine.webGLVersion === 2`. The ordinary canvas constructor's silent WebGL1 fallback
does not satisfy this plan.

Expose and display this stable diagnostics object; use `null` rather than omitted
fields so `exactOptionalPropertyTypes` and evidence JSON agree:

```ts
type RendererBackendDiagnostics = Readonly<{
  requested: "auto" | "webgl2";
  selected: "webgpu" | "webgl2" | null;
  webgpuSupport: boolean | null;
  webgpuInit: "not-attempted" | "ok" | "failed";
  webgpuFailure: { stage: "support" | "init"; message: string } | null;
  webgl2Init: "not-attempted" | "ok" | "failed";
  webglVersion: number | null;
  engineInfo: { description: string; vendor: string; renderer: string; version: string } | null;
}>;
```

Factory tests inject support, initialization, canvas replacement, and WebGL2 results.
They must deterministically cover unsupported fallback, rejected-init fallback on a
replacement canvas, forced-WebGL2 probe skipping, null WebGL2, and a version other
than 2, successful WebGPU, successful WebGL2, both backends failing, disposal of a
partially initialized engine, and context/device loss after success. Do not claim a
driver-specific reason when `IsSupportedAsync` merely returns false.

Subscribe to the selected engine's context/device-loss observable before starting its
render loop. Loss stops rendering and input, disposes scene/engine once, marks
`selected` null with a loss-stage renderer error, and asks `SimClient` to pause if it
is still live. Never switch backend during a measured run and never keep drawing a
stale scene. Recovery is an explicit page reload/rebootstrap; loss and both-backends-
failed states remain visible in diagnostics.

## Right-handed procedural scene

`scene.ts` constructs `new Scene(engine)` and immediately sets
`scene.useRightHandedSystem = true` before creating a camera, mesh, material, or
light. Assert that invariant in the scene contract test. Map simulation `(x, y)` to
Babylon `(x, elevation, y)`; handedness does not silently swap or negate axes.

Use a fixed orthographic isometric camera aimed at the disclosed arena centre. Resize
updates aspect and orthographic bounds without changing world scale or authoritative
state. Camera pan/zoom is presentation-only and bounded so the whole room can be
recovered.

Keep scene-order logic testable without WebGL: `createRightHandedScene(engine,
sceneFactory, buildContent)` calls `sceneFactory`, sets `useRightHandedSystem = true`,
then and only then calls `buildContent`. The injected fake scene records writes and
content construction; the test must fail if any content is created first.

The greybox is procedural:

- instance known floor and wall tiles; unknown tiles have no instance;
- use separate current and remembered materials;
- reconcile disclosed door and torch furniture by furniture identity;
- reconcile unit meshes by full generational identity;
- draw snapshot-local arrows/events through `transients.ts`;
- use one shadow-casting directional key and at most eight currently disclosed,
  unshadowed torch point lights;
- maintain debug counts for meshes, instances, draws, triangles, lights, shadow
  casters, and every visibility registry, without reading hidden rows.

Do not load room art, rigs, textures, or glTF in this phase. Do not add an audio cue;
the visibility acceptance still asserts that the audio registry remains empty for
an undisclosed record.

## Input and page orchestration

Add one `<canvas id="greybox">` and renderer/backend diagnostics to `/v2.html` without
removing the existing lifecycle, command, and buffer-exhaustion controls. `v2.ts`
creates `SimClient`, awaits renderer engine/scene creation, and in `onSnapshot`
synchronously copies the presentation snapshot before any lease can be returned.
Feed copies to `renderer.acceptSnapshot`; render interpolation uses only the last two
copies. Reset clears both copies and all identity/transient registries before the new
epoch is displayed. Dispose removes input listeners, disposes scene/engine, and then
disposes `SimClient` exactly once.

`client/src/bootstrap.ts` is an injected orchestration state machine rather than
top-level page side effects. Tests provide fake client, renderer, clock, and DOM
adapters and cover async engine success/failure, first snapshot copy before callback
return, reset clearing renderer before awaiting new ready, new-epoch acceptance,
terminal/context-loss disposal exactly once, and bootstrap rejection without a leaked
worker, listener, canvas, or engine. `v2.ts` only resolves real adapters and invokes
this bootstrap.

`client/src/input/greybox-input.ts` owns canvas input. Ground picking maps scene
`(x, z)` to sim `(x, y)`, multiplies by 1000, rounds once, verifies signed `i32`, and
submits the existing `goto` command. Reject unknown tiles; remembered and current
known floor may be targeted. Register Babylon's leaf ray-picking side effect explicitly
and pass it canvas-local CSS coordinates; Babylon applies hardware scaling internally.
A primary-button gesture shorter than four CSS pixels submits `goto` on release, while
a longer primary drag and every middle/secondary drag pan the camera in its screen-aligned
ground-plane basis. `Escape` submits `withdraw`; the wheel changes only the camera.
Actor focus is not implemented because worker protocol v1 exposes no focus
command; do not smuggle one through renderer state. Ignore input while reset or
terminal is active. Picking registries contain only currently disclosed targets.

## Fixed stress fixture

`stress.ts` is a pure presentation fixture selected only by `?stress=greybox`. It
does not mutate wasm, replay, or policy state and must be labelled synthetic in UI
and evidence. Fix these inputs so measurements are comparable:

```text
GREYBOX_STRESS_SEED = 0x5eed1234
room = 48 x 32 world units, 1-unit tiles
population = 64 bodies: 1 hero + 63 monsters
identity = indices 0..63, generation 1
visibility = every fixture tile current (VIS 2)
lights = 1 shadowed directional key + exactly 8 unshadowed torch lights
training workers = 0
render scale = 1
CSS/backing size = 1920 x 1080 for the named reference run
```

Derive placement/archetype variation from a committed integer-only fixture function
of `(GREYBOX_STRESS_SEED, index)` and assert the exact resulting population and room
bounds. No random/time-based population and no repeated live `spawn` commands are
accepted. The normal route continues to render real worker snapshots; the synthetic
route measures renderer headroom only.

## Automated contracts

Add these sentence-named tests to `client/test/render-contract.test.mjs`:

```text
leased_snapshot_views_are_copied_before_the_renderer_retains_them
dead_rows_do_not_resurrect_recycled_entities
interpolation_does_not_mutate_or_reveal_future_snapshots
unseen_units_have_no_render_audio_pick_or_debug_presence
unseen_shots_events_and_furniture_have_no_persistent_presence
remembered_geometry_uses_seen_not_current_visibility
fog_edge_generation_reuse_creates_no_one_frame_leak
transient_rows_are_snapshot_local_and_never_guessed_into_identity
renderer_modules_do_not_import_worker_or_wasm_implementation
presentation_decoding_uses_only_generated_offsets_and_codes
forced_webgl2_skips_webgpu_and_requires_a_version_two_context
webgpu_init_failure_records_diagnostics_and_replaces_the_canvas_before_fallback
successful_backends_report_stable_diagnostics_and_both_failed_is_terminal
context_or_device_loss_disposes_once_and_never_switches_backend
the_scene_is_right_handed_before_any_content_is_created
the_fixed_stress_fixture_has_the_named_seed_room_population_and_lights
bootstrap_copies_the_lease_before_return_and_clears_on_reset_epoch_and_terminal
primary_pointer_click_issues_goto_while_primary_drag_moves_the_live_camera
greybox_input_keeps_one_pointer_owner_and_recovers_after_throwing_host_callbacks
performance_capture_rejects_hidden_or_software_runs_and_exports_schema_one
canvas_control_uses_the_same_stress_fixture_clock_and_export_schema
vite_build_does_not_overwrite_legacy_page_or_assets
```

Compile the pure renderer files into `.tools/render-test` with the pinned TypeScript
compiler, following the existing worker protocol fixture style. Babylon/DOM-free
selection logic uses injected factories, so Node tests need no browser, GPU, canvas
shim, or network. Keep an automated Vite build assertion that client and worker stay
separate, wasm remains worker-only, and the legacy page/assets are not emitted over.

## Named measurement matrix and phase gate

`performance.ts` owns measurement state and UI export. It starts only after an
explicit user click while `document.visibilityState === "visible"`, aborts and marks
the run rejected on any visibility change, and never auto-starts in a test or hidden
tab. A `PerformanceObserver` collects `longtask` entries when supported and records
support explicitly. Each rAF sample stores timestamp and delta from the previous rAF;
percentiles use nearest-rank over deltas after the 30-second warm-up. Counts over
16.67 and 33.33 ms use strict `>` comparisons. On Babylon routes, draws come from
the engine's per-frame draw-call counter (including passes such as the shadow map),
active triangles come from `Scene.getActiveIndices() / 3`, and light and registered
shadow-caster counts come from the live scene presentation. The Canvas control counts
its actual Canvas2D primitives and reports zero triangles/shadow casters. These values
are sampled from the last completed rendered frame and stored beside the next rAF
delta; logical debug mesh/instance counts are diagnostic only and are not evidence.
Every sampling and completion boundary also requires a live, actively rendering
owner; context/device loss, disposal, or a stopped render loop rejects the run rather
than completing from the last cached frame.
The UI exposes those completed-frame counters separately from logical scene counts,
and capture refuses to start until draws are nonzero (and Babylon active triangles
are nonzero). A clear-only stale or damaged context therefore yields a reload-in-a-
fresh-tab diagnostic instead of performance evidence.

Reference capture sizing respects backing-store ownership. Set the active canvas CSS
content box to 1920x1080, then ask Babylon to resize its own backing store/swapchain;
never assign `canvas.width`/`height` behind a live Babylon engine. The Canvas2D control
owns and synchronises its backing dimensions directly. A failed setup restores the
previous CSS dimensions and asks the owner to resize again.

Reject a run whose diagnostics vendor/renderer/description case-insensitively contains
`SwiftShader`, `llvmpipe`, `software`, or `Microsoft Basic Render`; store the matched
reason. Browser APIs expose no portable GPU residency measurement, so
`gpuResidencyBytes` is exactly `null` with
`gpuResidencyMethod: "unavailable-browser-api"`; JS heap or wasm pages must not be
relabeled as GPU residency. This unavailable field does not invent a pass or fail.

The UI download exports raw JSON with `schemaVersion: 1` and this exact shape:

The stress fixture is explicitly labelled noninteractive: its simulation and pointer
controls are disabled to keep runs comparable. Start is visibly disabled until a
stress route is ready and throughout a run. The status counts down the 30-second
warm-up and 120-second sample phases from the capture clock. Each new start disables
Download and invalidates the previous export; Download becomes available only for a
complete run. Rejection, terminal loss, and disposal clear the progress timer, and a
rejected run may be started again without reloading.
For the designated foreground capturer, the six metadata fields are prefilled with
the known Windows/CPU/GPU/driver/power values; Chrome's full version is derived from
the user agent when available and otherwise uses the recorded fallback. These are
editable best-effort defaults, shared by Canvas/WebGPU/WebGL2 routes, and lock only
while a run is active so the operator can correct them before Start.

```ts
type GreyboxPerformanceRun = Readonly<{
  schemaVersion: 1;
  status: "complete" | "rejected";
  rejectionReasons: readonly string[];
  startedAt: string;
  metadata: Readonly<{
    os: string; cpu: string; gpu: string; driver: string;
    browser: string; powerMode: string;
    cssWidth: 1920; cssHeight: 1080; backingWidth: 1920; backingHeight: 1080;
    devicePixelRatio: number; renderScale: 1;
    fixtureSeed: 1592594996; population: 64; roomWidth: 48; roomHeight: 32;
    trainingWorkers: 0;
    backend: RendererBackendDiagnostics | Readonly<{
      requested: "canvas"; selected: "canvas2d";
      webgpuSupport: null; webgpuInit: "not-attempted"; webgpuFailure: null;
      webgl2Init: "not-attempted"; webglVersion: null;
      engineInfo: { description: "Canvas2D control"; vendor: "browser";
        renderer: "canvas2d"; version: string };
    }>;
  }>;
  warmupMs: 30000;
  sampleMs: 120000;
  samples: readonly Readonly<{
    atMs: number; deltaMs: number; draws: number; triangles: number;
    lights: number; shadowCasters: number;
  }>[];
  longTasks: Readonly<{ supported: boolean; count: number; totalMs: number }>;
  summary: Readonly<{
    p50Ms: number; p95Ms: number; p99Ms: number;
    framesOver16_67Ms: number; framesOver33_33Ms: number;
    gpuResidencyBytes: null;
    gpuResidencyMethod: "unavailable-browser-api";
  }>;
}>;
```

Create `docs/performance/v2-reference-matrix.md` before profiling. It is a blank
evidence template until a visible foreground run occurs; do not pre-fill pass claims.
Record exact Windows build, CPU, GPU, driver, browser channel/build, power mode,
CSS/backing resolution, device pixel ratio, render scale, selected backend and full
fallback diagnostics, fixture seed/population/room, draws, triangles, nine lights,
shadow settings, and confirmation of zero training workers.

Warm 30 visible-foreground seconds, sample 120 visible-foreground seconds, and report
p50/p95/p99 frame time, `framesOver16_67Ms`, `framesOver33_33Ms`, long tasks, draws,
triangles, and residency. Automated or hidden browser tabs may validate behavior but
may not supply performance evidence. WebGPU passes only
when diagnostics say `selected: "webgpu"` and p95 is at most 16.67 ms. Forced WebGL2
passes only with `requested: "webgl2"`, `webglVersion: 2`, and p95 at most 33.33 ms.

The comparable Canvas control is not an informal run of the moving legacy game.
`client/src/render/canvas-control.ts` consumes the same frozen stress fixture and the
same rAF sampler through `/v2.html?stress=greybox&renderer=canvas`; it draws the same
64 identities, 48-by-32 disclosed room, and eight torch markers at 1920 by 1080 with
render scale 1. It exports the identical schema with `metadata.backend` replaced by
`{ requested: "canvas", selected: "canvas2d", ...stable null WebGPU fields }`.
Run the initial Canvas2D control, WebGPU, forced WebGL2, then the repeated Canvas2D
control, in that order, with seed `0x5eed1234`, zero training workers, 30,000 ms
warm-up and 120,000 ms sampling for every run. Reject each by the same visibility
rule and save untouched
raw output to
`docs/performance/evidence/YYYY-MM-DD-v2-greybox-canvas2d-control.json`. This is a
greybox renderer control, not evidence about the legacy Canvas game's frame rate.

Record shared coordinate conventions for Fighter, Brute, arrows, walls, and doors.
The phase gate records `pass`, `replace`, or `stop` for Babylon independently of room
art and articulated combat. Visible correctness does not settle that gate: absent an
explicit recorded owner waiver, status remains performance-pending until all four
foreground captures are accepted, and this plan must not claim the performance
targets passed before then.

Update `docs/performance/README.md` with this protocol and an initially pending phase
row. After each accepted run, commit its untouched download at
`docs/performance/evidence/YYYY-MM-DD-v2-greybox-<backend>.json` and a sibling Markdown
interpretation linking the raw JSON. Rejected runs may be retained as diagnostics but
cannot support the phase decision. The final phase record links the initial Canvas
control, accepted WebGPU, forced-WebGL2, repeated Canvas control, and the manual
correctness matrix.

Run the same executable real-worker matrix on `/v2.html?seed=1&backend=auto`
and `/v2.html?seed=1&backend=webgl2` before performance collection. For each backend record the
selected backend diagnostics, then: click Pause and Resume and observe tick stop/start;
click Goto, enter world milli-coordinates `1000,1000`, and observe the disclosed hero
route; press Escape and observe withdraw; click Reset with seed `1` and verify the
scene clears until the new epoch; resize from 1280 by 720 to 1920 by 1080; enable the
three-lease diagnostic, advance one tick, and release it. Record pass/fail per action.
These rows exercise the real worker rather than a fabricated renderer fixture.

State that cannot be induced repeatably from public UI is an automated gate, not a
manual checkbox: `fog_edge_generation_reuse_creates_no_one_frame_leak` covers fog and
slot reuse; `unseen_shots_events_and_furniture_have_no_persistent_presence` and
`remembered_geometry_uses_seen_not_current_visibility` cover all disclosure classes;
`context_or_device_loss_disposes_once_and_never_switches_backend` injects loss through
the backend test seam. Its fixture must trigger both WebGPU `device.lost` and WebGL2
`webglcontextlost`, prevent default on the latter, and assert one terminal callback,
one disposal, no fallback, and no subsequent scene mutation. The manual matrix links
these exact automated results rather than asking a user to manufacture death,
generation reuse, fog topology, or device loss in DevTools.

## Implementation result and browser smoke

The final automated gate report is green: 458 Cargo tests passed with 5 ignored,
dependency checks passed 14 tests, toolchain checks passed 7, documentation checks
passed 19, renderer contracts passed 29, Worker protocol tests passed 42, the wasm
memory probe passed 1, and wasm/native equality passed 16. Every golden hash remained
unchanged. The production build emitted the compiled Worker separately and emitted no
raw TypeScript Worker asset.

A visible-browser functional smoke on 2026-08-08 established startup and basic
orchestration only; it is not correctness-matrix or performance evidence. The WebGPU
stress route selected WebGPU, the forced-WebGL2 stress route reported WebGL version 2,
the Canvas2D control started, and the real-Worker WebGPU route reached Ready. All four
showed no error and `terminal: false`. On the real-Worker route, Pause held the tick,
Resume advanced it, and Reset reached epoch 2 at tick 0. At that point Withdraw,
resize, user-confirmed input, complete visible presentation, the paired manual backend
matrix, and all four foreground performance captures remained pending.

That smoke caught one integration defect before evidence collection: Babylon mutates
the engine options object during construction, so passing the repository's frozen
shared option constants directly caused startup to fail. Production now passes a
fresh mutable spread of the WebGPU or WebGL option constant to each engine. The
constants remain immutable authorities, while Babylon owns only the per-engine copy.

The first user input check then found that both floor click and camera pan appeared
inert. Diagnosis reproduced a synchronous Babylon failure: `Scene.createPickingRay`
requires the side-effect registration from `@babylonjs/core/Culling/ray.js`, which the
leaf-import client had omitted. The fixed input adapter registers Ray explicitly,
passes Babylon CSS-space pointer coordinates, and treats a primary gesture shorter
than four CSS pixels as a click while a longer primary gesture becomes a captured
camera drag. Its single-pointer ownership and callback-failure recovery are also
explicit.

The expanded 29-of-29 renderer gate covers the exact tests
`primary_pointer_click_issues_goto_while_primary_drag_moves_the_live_camera` and
`greybox_input_keeps_one_pointer_owner_and_recovers_after_throwing_host_callbacks`.
An agent-controlled visible-browser retest then observed a floor click submit Goto and
a primary drag move the live camera. The user subsequently hard-refreshed the rebuilt
WebGPU real-Worker page and confirmed that both behaviors now work. The matrix accepts
that first confirmation, then records the user's subsequent statement that the full
requested checklist works on both auto-selected WebGPU and forced WebGL2: Pause/Resume;
floor-click Goto and Escape Withdraw; reset without an old-epoch flash; resize followed
by click, primary-drag pan, and wheel zoom; three-buffer hold with continued tick and
release; visible units, shots/effects, doors, and torches; and backend diagnostics.
Visible correctness is therefore complete. The out-of-order forced-WebGL2 diagnostic in
[`2026-08-08-v2-greybox.md`](../performance/evidence/2026-08-08-v2-greybox.md#diagnostic-result)
recorded 7,200 samples with p50 16.70 ms, p95 16.80 ms, p99 16.80 ms, 4,138 frames
over 16.67 ms, zero over 33.33 ms, and zero long tasks. Its explicit WebGL2 request,
selection, and version 2 diagnostics meet the individual 33.33 ms p95 threshold when
considered alone. Its `Chrome 151.0.0.0` metadata is a reduced user-agent value rather
than the full browser build. Because the required initial Canvas2D control and WebGPU
artifacts were not recorded before this import, the diagnostic cannot fill the
accepted WebGL2 slot. A fresh WebGL2 capture must follow those two runs, and the
repeated Canvas2D control must follow it. At that point none of the four ordered
captures had been accepted, and the paired phase decision could not pass.

The subsequent initial Canvas2D control is accepted as ordered slot 1 of 4. Its
untouched [schema-one JSON](../performance/evidence/2026-08-08-v2-greybox-canvas2d-control.json)
has SHA-256
`e3e8b6225bd72f74432936e83dd528593ea91ecb73aae0c44c600232f367b5d2`
and records 7,200 samples: p50 16.70 ms, p95 16.80 ms, p99 16.90 ms, 4,126
frames over 16.67 ms, zero over 33.33 ms, and zero long tasks. It issued 1,609
Canvas2D primitives per sampled frame with zero triangles and shadow casters, nine
lights, the fixed fixture, full Chrome 151.0.7922.72 provenance, and the required
1920 by 1080 CSS/backing size.

The ordered [WebGPU raw capture](../performance/evidence/2026-08-08-v2-greybox-webgpu.json)
began at `2026-08-09T00:44:30.817Z`, after the Canvas slot's nominal end at
`2026-08-09T00:43:54.968Z`, so it is valid slot 2. Its SHA-256 is
`6fd1b6daa3c6d61c5b0117a56997d23430bf47268fd89d00a89005f78943413e`.
It is schema one, complete with no rejection reasons, and records 7,200 samples:
p50 16.70 ms, p95 16.80 ms, p99 16.90 ms, 4,020 frames over 16.67 ms, zero over
33.33 ms, and zero long tasks. Auto selected WebGPU with support `true` and init
`ok`; the full Chrome and fixed-fixture provenance matches slot 1. Its 11 draws,
11,752 triangles, nine lights, and 220 shadow casters were stable. The written WebGPU
p95 threshold is at most 16.67 ms, so this result fails by 0.13 ms. At that point a
fresh ordered forced-WebGL2 capture and repeated Canvas2D drift control remained
pending; the final decision below records their later waiver.

The additional [early Canvas2D raw capture](../performance/evidence/2026-08-08-v2-greybox-canvas2d-control-early-repeat.json)
is complete but cannot fill slot 4. It began at `2026-08-09T00:47:29.693Z`, only
28.876 seconds after WebGPU's nominal finish at `2026-08-09T00:47:00.817Z`, so an
ordered 150-second WebGL2 capture could not have occurred between them. Its SHA-256
is `5c80a5af94112440b84b43237ba068767856c48d2d2e254b5af2822a3a9c04a4` and its
7,200 samples record p50 16.70 ms, p95 16.80 ms, p99 16.90 ms, 4,086 frames over
16.67 ms, zero over 33.33 ms, zero long tasks, 1,609 draws, and nine lights. It remains
a diagnostic only. Under the original protocol, an accepted final control would have
followed a new ordered WebGL2 run; the final decision below waives both artifacts.

## Final phase decision

On 2026-08-08 the project owner stated that the collected evidence was sufficient
because every renderer had been covered at least once, and directed the project to
proceed. That instruction closes v2-08 and waives the still-missing ordered WebGL2
recapture and later Canvas2D control. The waiver preserves rather than rewrites the
record: the original ordered protocol reached 2 of 4 slots, the WebGPU p95 of 16.80
ms failed the 16.67 ms target by 0.13 ms, the WebGL2 diagnostic was out of order, and
the early Canvas repeat could not measure end-of-series drift.

The phase decision is **proceed/pass with a measured exception**. Babylon remains the
reversible v2 presentation backend, while the threshold miss remains explicit input
to later optimization and representative-room measurement. This is not a numerical
WebGPU pass and does not establish the omitted Canvas drift comparison.

## Commands and acceptance

```powershell
npm ci
node tools/check_deps.js
node tools/check_toolchain.js
node tools/check_docs.js
npm run check
npm run build
node --test client/test/render-contract.test.mjs
npm run test:worker
cargo test
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
git diff --check
```

Automated acceptance requires all tests above, unchanged native/wasm hashes, a
production build with separate hashed client and worker chunks, no renderer import of
worker/wasm implementation, and no unknown/seen-only spatial residue. The real-worker
manual matrix and a valid initial Canvas plus WebGPU run were completed. The owner
explicitly waived the otherwise-required ordered WebGL2 recapture and repeated Canvas
control and accepted the measured WebGPU exception. That decision completes the
session without claiming that the original four-run protocol or WebGPU numerical gate
passed.
