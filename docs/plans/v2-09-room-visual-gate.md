# v2-09 — validate one representative room pipeline

**Status:** automated implementation complete (2026-08-08) — initial art decision `replace`; replacement review and ordered foreground performance evidence pending.

**Goal:** determine whether one reproducible offline room kit, the Babylon asset
loader, and the current bounded renderer can at least recover the old-version
screenshot's readable playfield hierarchy on the way toward `CONCEPT.png` without
weakening visibility, authority, lifecycle, or performance evidence.

**Depends on:** `v2-08`, complete under its recorded owner waiver. That waiver did
not turn WebGPU p95 `16.80 ms` into a numerical pass and did not fill the missing
ordered WebGL2 and final Canvas2D slots. This session preserves that provenance and
measures the room against the unchanged thresholds.

**Golden expectation:** `LAB_HASH`, `GOLDEN_STATE_HASH`, `ROOM_HASH`, `BATTLE_HASH`,
`SWAP_HASH`, and `BOW_HASH` do not move. No room input enters `fx`, `sim`, `policy`,
wasm, commands, replays, or either hash domain.

## Landable result and file ownership

Add or change only the presentation/tooling/documentation files below:

```text
.gitignore
tools/art/build_slice.py
tools/art/room.py
tools/art/materials.py
tools/art/export.py
tools/art/manifest.json
tools/validate_assets.js
tools/validate_assets.test.js
web/assets3d/room_slice.glb
web/assets3d/room_slice.json
web/assets3d/room_slice.validator.json
client/src/render/room-asset-contract.ts
client/src/render/room-asset.generated.ts
client/src/render/room-assets.ts
client/src/render/room-environment.ts
client/src/render/room-review-camera.ts
client/src/render/room-stress.ts
client/src/render/renderer.ts
client/src/render/performance.ts
client/src/bootstrap.ts
client/src/v2.ts
client/test/render-contract.test.mjs
vite.config.ts
package.json
package-lock.json
tools/toolchain.json
tools/check_toolchain.js
tools/check_toolchain.test.js
docs/reference/room-asset-contract.md
docs/reference/renderer-contract.md
docs/architecture/assets.md
docs/architecture/browser-runtime.md
docs/decisions/0003-renderer-outside-sim.md
docs/performance/README.md
docs/performance/v2-room-matrix.md
docs/performance/evidence/2026-08-room-slice.md
docs/performance/evidence/YYYY-MM-DD-v2-room-<slot>.json
docs/README.md
README.md
```

Do not change procedural `EnvironmentPresentation` mesh dimensions to make an asset
fit. Do not edit `crates/` or the legacy Canvas page. The already-landed exact direct
dependencies remain:

```json
"@babylonjs/core": "9.18.1",
"@babylonjs/loaders": "9.18.1",
"babylonjs-gltf2interface": "9.18.1",
"gltf-validator": "2.0.0-dev.3.10"
```

`tools/toolchain.json` owns `babylon`, `babylonLoaders`,
`babylonGltfInterface`, `blender`, and `gltfValidator`; the dependency and toolchain
checkers continue to require exact package, lock, and installed versions. The
validator is already pinned — this session verifies the existing pin rather than
adding it again.

## Durable authorities

`docs/reference/room-asset-contract.md` becomes canonical and contains these routed
markers:

```text
DOC_CONTRACT: room-asset-manifest
DOC_CONTRACT: room-asset-coordinates
DOC_CONTRACT: room-asset-reproducibility
DOC_CONTRACT: room-asset-validation
DOC_CONTRACT: room-asset-disclosure
DOC_CONTRACT: room-asset-loader-lifecycle
```

It owns manifest/sidecar semantics, coordinates and pivots, generator identity and
hash rules, validation and budgets, disclosure-to-instance mapping, loader failure,
and the fact that bounds are presentation-only. Update the docs map and inbound
links. `docs/architecture/assets.md` graduates the room GLB pipeline to current while
leaving combatant GLBs proposed; it records provenance/licensing and states that
`web/assets/CONCEPT.png` is a review target, never a runtime dependency.
`browser-runtime.md` owns root-host loading and startup sequencing;
`renderer-contract.md` owns visibility and lifecycle integration; ADR 0003 records
the loader as part of the reversible Babylon bet. `docs/performance/v2-room-matrix.md`
owns this session's matrix and dated evidence owns measurements.

## Manifest, sidecar, and generated kit

`tools/art/manifest.json` is reviewed input with `schemaVersion: 1`. It contains:

```ts
type RoomBuildManifestV1 = Readonly<{
  schemaVersion: 1;
  generatorVersion: 3;
  license: "MIT";
  fixtureId: "v2-room-slice-1";
  generatorSeed: 1592594996;
  tolerance: "0.00001";
  toolchain: { blender: "4.5.12"; blenderBinarySha256: string };
  coordinates: {
    sceneHandedness: "right"; upAxis: "+Y"; groundAxes: ["+X", "+Z"];
    metresPerUnit: 1; tileSize: 1;
  };
  export: {
    format: "GLB"; applyModifiers: true; exportMaterials: "EXPORT";
    exportYup: true; useSelection: true; animations: false;
    vertexColor: "NAME"; vertexColorName: "room_style";
    allVertexColors: false;
  };
  styling: {
    id: "readable-stone-v1"; mode: "deterministic-vertex-color";
    attribute: "room_style"; textures: true; variation: DecimalString;
    palette: Readonly<Record<string, readonly [DecimalString, DecimalString, DecimalString, DecimalString]>>;
  };
  textures: Readonly<Record<"floor" | "wall", {
    path: `tools/art/textures/${string}.png`; sha256: string;
    mimeType: "image/png"; width: 1254; height: 1254;
  }>>;
  textureProcessing: {
    width: 512; height: 512; periodicEdgePixels: 32; colourSpace: "sRGB";
    wrap: "repeat"; magFilter: 9729; minFilter: 9987;
  };
  budgets: {
    payloadBytes: 25165824; estimatedGpuBytes: 268435456;
    maxNodes: number; maxMeshes: number; maxMaterials: number;
    maxVertices: number; maxTriangles: number;
  };
  allowedValidatorWarnings: readonly [];
  materials: Readonly<Record<
    "floor_current" | "stone_current" | "wood_current" | "metal_current" | "emissive_flame",
    Readonly<Record<string, string | number | boolean>>
  >>;
  pieces: readonly RoomPieceSpecV1[];
  outputs: {
    glb: { path: "web/assets3d/room_slice.glb"; sha256: string };
    sidecar: { path: "web/assets3d/room_slice.json"; sha256: string };
    validator: { path: "web/assets3d/room_slice.validator.json"; sha256: string };
  };
}>;
```

`RoomPieceSpecV1` is exact rather than an implementation placeholder:

```ts
type RoomPieceSpecV1 = Readonly<{
  name: "floor_a" | "floor_b" | "wall_straight" | "wall_inside"
    | "wall_outside" | "wall_end" | "door_frame" | "door_leaf"
    | "torch_bracket" | "decal_rubble" | "decal_root" | "prop_barrel";
  node: `ROOM_${string}`;
  materialRole: "floor_current" | "stone_current" | "wood_current" | "metal_current";
  bounds: { min: [DecimalString, DecimalString, DecimalString]; max: [DecimalString, DecimalString, DecimalString] };
  pivot: "ground-centre" | "lower-hinge";
  allowedQuarterTurns: readonly (0 | 1 | 2 | 3)[];
  socket: null | {
    name: "SOCKET_torch_flame";
    translation: [DecimalString, DecimalString, DecimalString];
    rotation: [DecimalString, DecimalString, DecimalString, DecimalString];
  };
}>;
type DecimalString = string; // Runtime validation applies the canonical decimal regex below.
```

The schema additionally requires `node === "ROOM_" + name`; the broad
template-literal type alone is not treated as that proof.

The manifest is not generated and its own hash is not an output. Define
`buildInputsSha256` over canonical UTF-8 JSON of the manifest with the entire
`outputs` object omitted. The canonicalizer recursively sorts object keys by Unicode
code point, preserves array order, emits no insignificant whitespace, uses ordinary
JSON escaping with non-ASCII UTF-8 left unescaped, and permits JSON numbers only when
they are safe integers. Every non-integral generator quantity is a canonical decimal
string matching `^-?(0|[1-9][0-9]*)\.[0-9]+$` and is converted explicitly by Blender;
there is therefore no Python/JavaScript exponent or rounding disagreement.
`room_slice.json` is generated metadata with
`schemaVersion: 1`, `fixtureId`, that `buildInputsSha256`, GLB SHA-256, exact piece and
socket records, measured local bounds/counts, aggregate counts, payload bytes, and
the deterministic GPU estimate. It never contains the full manifest SHA, so the
manifest may pin the sidecar without a hash cycle. Runtime accepts only this exact
fixture identity, build-input hash, and matching GLB hash. Add both
`tools/art/manifest.json`, the generated sidecar, and the generated validator report to
`tools/toolchain.json.manifests` so dependency-manifest discovery cannot orphan them.

`build_slice.py --write` also generates
`client/src/render/room-asset.generated.ts` with exact frozen literals
`ROOM_FIXTURE_ID`, `ROOM_BUILD_INPUTS_SHA256`, `ROOM_SIDECAR_SHA256`,
`ROOM_GLB_SHA256`, and `ROOM_VALIDATOR_SHA256`. Runtime hashes the raw sidecar bytes and compares them with the
compiled sidecar pin before parsing; it then compares the parsed build-input hash and
the fetched GLB hash with the other compiled pins. A self-consistent substituted
sidecar/GLB pair therefore fails. `--verify`, `validate_assets`, and the Vite build
all compare the generated TypeScript literals to manifest and committed bytes.

Piece names are exactly:

```text
floor_a floor_b wall_straight wall_inside wall_outside wall_end
door_frame door_leaf torch_bracket decal_rubble decal_root prop_barrel
```

Each piece has one mesh node named `ROOM_<piece>`, one material from the allowlist
`stone_current`, `stone_remembered`, `wood_current`, `metal_current`,
and identity local transform. `stone_remembered` is a runtime material role, not a
second material baked into every stone mesh. The general room factory creates a
remembered source clone for floor/wall geometry and assigns that material;
it never branches on a piece name to correct geometry. The only socket is the empty node
`SOCKET_torch_flame` parented to `ROOM_torch_bracket`; it has no mesh/material.
All mesh pivots lie on ground at the tile-local placement origin. Door leaf pivot is
the hinge. Wall endpoints land on exact half-tile boundaries. The sidecar records
axis-aligned finite local bounds and the socket's finite translation and quaternion.
The renderer applies only tile translation, quarter-turn rotation, and uniform
`tileSize`; no piece-name correction table is allowed.

`room.py` creates two seeded irregular flagstones, straight/inside/outside/end walls,
door frame and leaf, torch bracket/socket, rubble and root geometry decals, and one
barrel-sized prop. KTX2, external images, animation, skinning, morphs, cameras,
embedded lights, audio, LODs, compression extensions, bulk variants, and combatants
remain excluded. Geometry decals use meshes and allowlisted materials; they do not
smuggle deferred texture files into the slice. Generator version 3 retains one
CORNER-domain `room_style` color layer per mesh and exports it as normalized
`UNSIGNED_SHORT` `VEC4` `COLOR_0`. It takes the checked 1,254 x 1,254
`tools/art/textures/room_floor_albedo.png` and `room_wall_albedo.png` inputs. Their SHA-256 values are
`948fad4172800b7b78b2500a8da91e2b7b1c6ad1af18f00ccff854af92a6340b` and
`11eb80b1161c47e975499583e5a4052731181b9411dc346dd795379851d13845`.
Pinned Blender resamples each to 512 x 512, applies a symmetric 32-pixel horizontal
edge blend followed by the vertical edge blend, then embeds the sRGB results with
repeat wrap, linear magnification, and trilinear minification. Embedded hashes are
`77215f5d4f92ce4384bc1136e6c4bbdc66353eeba6b0a0590dca337ac0bdc743`
and `bce279eb8aee948b59821365912b683e0013b29f84ede455505f55c2c748dd54`.
No external URI or runtime texture request is allowed.
`floor_current` and `stone_current` are neutral factors over those textures and
`COLOR_0` modulation. The superseded generator-v2 vertex-only artifact remains an
intermediate historical attempt; generator v3 is the current mechanical candidate,
but the owner decision stays `replace` until visible WebGPU/WebGL2 review.

## Reproducible build

Invoke the reviewed portable Blender executable at
`.tools/blender-4.5.12/blender-4.5.12-windows-x64/blender.exe`, never an unqualified
`blender`. `build_slice.py` starts from the factory-empty scene and fixes locale,
units, axes, seed, object creation order, modifier values, material/socket names,
export selection, and exporter options from the manifest. It rejects an unexpected
Blender version or executable SHA before scene creation.

```text
build_slice.py --write   export repository outputs and print candidate SHA values
build_slice.py --verify  export into two distinct temporary directories
                         and require both GLBs, sidecars, and canonical validator
                         reports byte-equal, then require every SHA equal its
                         manifest pin and committed output
```

Neither command silently edits expected hashes. A deliberate re-record edits the
manifest in review after `--write`, then `--verify`; the change records why geometry
changed and preserves old measurement provenance. Temporary paths, wall clock,
host name, user name, filesystem order, and timestamps must not enter either output.
Byte equality is required under the pinned Windows Blender binary. Across a future
reviewed tool patch, semantic sidecar/validator equality remains the compatibility
contract and any byte-pin change follows the explicit re-record path.

`.gitignore` owns `__pycache__/` and `*.py[cod]`. Both `--write` and `--verify`
finish with no Python cache under `tools/art/`; the sentence test
`room_generation_never_leaves_python_cache_in_the_repository` checks a clean
temporary import/run and the live repository path.

## Offline validation and budgets

`tools/validate_assets.js` exports pure `parseGlb`, `parseRoomSidecar`,
`estimateGpuResidency`, and `validateRoomAsset`, plus a CLI. It reads bounded bytes
before allocation, validates GLB 2 magic/version/declared length/chunks, and runs
`gltf-validator` with no external-resource callback. The asset must be one GLB with
one JSON and at most one BIN chunk; external URI, data URI, image, texture, animation,
skin, morph, camera, embedded light, sparse accessor, unknown/required extension,
NaN/infinite value, cyclic node graph, duplicate semantic name, nonidentity source
transform, and out-of-contract accessor/component type all fail.

The validator report must have zero errors and zero warnings. Informational messages
are retained in the deterministic report but do not fail. Sidecar names, bounds,
counts, hashes, fixture identity, and socket parent/transform must match independently
parsed GLB data. Total payload is `GLB byteLength + sidecar UTF-8 byteLength` and must
be at most `25,165,824` bytes; compressed transfer size and `dist` JavaScript are not
relabeled as payload.

The deterministic upper-bound GPU estimate is:

```text
sum(bufferView.byteLength used by vertex/index attributes, counted once)
+ sum(decoded texture width * height * 4 * mipFactor, where mipFactor is 4/3)
+ sum(instanceCapacity(role) * 16 floats * 4 bytes * bufferingFactor 2)
+ shadow map bytes: 1024 * 1024 * 4
```

This texture-free slice has a zero texture term. The estimate includes source data
once and these fixed capacities: floor_a 768, floor_b 768, wall_straight 160,
wall_inside 4, wall_outside 8, wall_end 4, door_frame 2, door_leaf 2,
torch_bracket 8, decal_rubble 4, decal_root 4, and prop_barrel 4. The formula uses
capacity, not current live count, and validator tests total every term independently.
It must be at most `268,435,456` bytes.
This is an offline conservative estimate, not browser-measured residency;
performance JSON continues to record `gpuResidencyBytes: null` because no portable
browser API supplies it.

## Runtime loader and root-host contract

`client/src/render/room-asset-contract.ts` parses and validates unknown JSON without
type assertions as trust. It rejects extra/missing keys, wrong schema/fixture/hash,
unbounded arrays/strings, duplicate pieces, unknown materials, nonfinite values,
invalid bounds/quaternions, and paths outside the fixed root assets. It exports
`parseRoomAssetSidecar` and the exact frozen TypeScript types.

`client/src/render/room-assets.ts` is reachable only through a dynamic import made
after parsing `room=representative`. Ordinary GPU/greybox and Canvas routes must not
load or register the glTF graph. The room module imports the minimal loader
registration side effect:

```ts
import "@babylonjs/loaders/glTF/2.0/glTFLoader.js";
import { LoadAssetContainerAsync } from
  "@babylonjs/core/Loading/sceneLoader.js";
```

It exports `loadRoomAsset(scene, signal, fetcher = fetch): Promise<RoomAsset>`. Fetch
`/assets3d/room_slice.json` first with same-origin credentials, require HTTP 200 and
`application/json`, validate it, then fetch `/assets3d/room_slice.glb`, require HTTP
200 and `model/gltf-binary` (allow `application/octet-stream` only in dev with an
explicit diagnostic), cap bytes before hashing, verify SHA-256 with Web Crypto, and
load that verified in-memory data exactly as
`LoadAssetContainerAsync(glbBytes, scene, { pluginExtension: ".glb", name:
"room_slice.glb" })`. `glbBytes` is the bounded verified `Uint8Array`; no URL or
external URI is passed to Babylon. Validate every loaded node/material against the
sidecar before exposing it.

`RoomAsset` owns the validated, attached, scene-bound `AssetContainer`, hidden source
meshes, materials, lookup
maps, and `dispose()`. It can be disposed exactly once. Abort, fetch/decode/hash/load
failure, backend loss, pagehide, initialization failure, or disposal before the
promise settles disposes all partially created Babylon objects. Failure is terminal
for `?room=representative`; it never silently falls back to procedural geometry and
never retries every frame. The ordinary page without that query remains the
procedural greybox and therefore supplies the explicit removal/fallback path.

`room_slice.validator.json` is committed build/evidence provenance, not a runtime
input. `--write` produces two independent canonical reports and requires byte
equality before committing; `--verify` requires both temporary reports byte-equal and
equal to the manifest pin and committed report. `tools/validate_assets.js` validates
that committed report explicitly. Room schema-2 evidence records its SHA-256.

Because Vite currently sets `publicDir: false`, extend the existing artifact plugin
to serve only the exact runtime GLB and sidecar allowlist in development and to copy
only those two into `dist/assets3d/` during `closeBundle`. The build checks the
committed validator report and generated hash but deliberately does not deploy it.
The build assertion verifies runtime files, their magic/schema/hash, and that no
other `web/assets3d` file was emitted.
The dev smoke fetches root `/v2.html`, the transformed client and Worker modules,
`/web.wasm`, the JSON, and GLB; it checks status, MIME, wasm/GLB magic, and no raw TS.

## Renderer integration and disclosure

Add `?room=representative`. It is valid in real-worker mode and in the fixed
`?stress=room` route. `?stress=room` requires `room=representative` and GPU
`renderer=auto|webgl2`; `renderer=canvas` remains the procedural greybox drift
control and cannot claim to render GLB art.

`createGreyboxRenderer` gains an optional frozen `GreyboxRendererOptions` containing
`createEnvironment?: (scene, debug, signal) => Promise<EnvironmentOwner>`. The v2
entry dynamically imports `room-assets.ts` only for `room=representative` and passes
a closure that calls `loadRoomAsset` after the renderer has created its engine and
Scene. The callback then constructs `RoomEnvironmentPresentation` from that
scene-bound asset. This avoids pre-creating or cross-wiring a second Scene. Clone
incoming options before Babylon can mutate them. Asset load completes before scene
presentation, input attachment, Worker `init`, or stress capture readiness.
`GreyboxRenderer.dispose()` aborts a pending factory, disposes presentations before
the shared `RoomAsset`, then scene and engine. Startup/loss races retain the existing
scene-before-engine and terminal-once rules.

`RoomEnvironmentPresentation` implements the same public seam used by
`GreyboxRenderer`: `acceptSnapshot`, `reset`, `counts`, `shadowGenerator`, and
`dispose`. A small interface in `renderer.ts` lets the renderer select procedural
`EnvironmentPresentation` or room presentation; actors/transients remain unchanged.
After its complete imported closure validates, the loader attaches the trusted
container to the renderer's existing Scene. Its root, source meshes, geometry, and
materials are Scene-owned but nonspatial resources until asset disposal. Source
meshes remain enabled as required by Babylon classic and WebGPU instances, but have
`isVisible = false`, `isPickable = false`, and never enter shadow/debug/pick
registries. NullEngine tests prove their instances reach scene evaluation and that
asset disposal removes the attached sources and materials. Each distinct current
material and the remembered material variant is force-compiled with instance
support. The sources themselves are never rendered, shadow casters, debug/presence
entries, or active instances. Only spatial instances authorized by the current
`PresentationSnapshot` are enabled. Application ready and performance capture wait
for a completed authored-room frame after those preparations.

The exact mapping is presentation-only and deterministic:

- known open tile: `floor_a` or `floor_b` from unsigned integer mix of fixture seed,
  `tx`, and `ty`; visibility 1 uses `stone_remembered`, visibility 2 uses current;
- known solid tile: floor plus wall pieces selected from the four cardinal known
  solid neighbor bits; unknown/fog never supplies topology. Straight east/west
  neighbors use quarter turn 0 and north/south neighbours quarter turn 1; other roles
  use the lowest matching declared quarter turn;
- current disclosed door: `door_frame` plus `door_leaf`, with leaf rotation derived
  only from its disclosed open/shut state;
- current disclosed torch: `torch_bracket`, a tiny non-pickable/non-shadow emissive
  sphere at its exact socket, and one point light, capped by the existing eight-light
  rule in stable furniture-key order. The flame material is `[1, 0.3, 0.055]`; point
  diffuse is `[1, 0.42, 0.12]` and specular `[1, 0.56, 0.24]`, with existing
  intensity/range. Flames contribute effects and separate procedural draw groups,
  making stress draws 20 (12 source groups plus eight flames) while lights remain 9;
- current disclosed prop/decal records may instantiate their named piece only if the
  sidecar and snapshot kind map says so. This session does not invent undisclosed
  furniture kinds.

Visibility 0 or map 255 creates no enabled spatial instance, light,
shadow caster, pick target, debug bound, label, effect, audio, or registry entry.
Visibility 1 permits remembered floor/wall only; no door, torch, prop, decal, light,
shadow, or picking. Visibility 2 uses disclosed current geometry/furniture. Every
registry is rebuilt/reconciled from the current copy; reset/epoch change/absence
removes stale objects immediately. Picking returns tile/furniture semantics, never a
Babylon source node or collision body. Sidecar bounds are debug/picking presentation
bounds and never simulation collision or command authority.

Extend `RendererDebugRegistry` ownership counts rather than maintaining an asset-only
parallel diagnostic. Source container meshes do not count as visible presence or
draws. Counts, scene meshes, active meshes, pick registrations, shadow render list,
lights, and all visibility registries must agree after every transition. No
per-piece correction enters `environment.ts`, `room-environment.ts`, or renderer
orchestration.

## Fixed room fixture and performance evidence

`client/src/render/room-stress.ts` exports `createRoomStressFixture` and exact named
constants. It preserves the v2-08 `48 x 32`, tile size 1, seed `1592594996`, 64
bodies, eight torches plus one directional light, no training workers, 1920x1080 CSS
and backing size, DPR recorded, render scale 1, 30-second warm-up, and 120 visible
foreground seconds. It fixes the room's map, door states, kit multiplicities, camera,
and all-visible disclosure in source so performance changes cannot quietly simplify
the scene. The committed fixture has exactly 1,536 floor instances (768 per floor
variant), 176 solid wall tiles split as 160 straight, 4 inside, 8 outside, and 4 end,
two door frames, two leaves, eight brackets, four rubble decals, four root decals,
four barrels, and 64 bodies. `ROOM_STRESS_MAP_SHA256` is computed from the exact
1,536 map bytes and committed beside the fixture before any capture; manifest,
sidecar, matrix, and tests repeat that literal. Changing it invalidates old room
evidence.

Do not overload schema-one greybox evidence. Extend `performance.ts` with schema 2:

```ts
type RoomPerformanceFixtureV2 = Readonly<{
  kind: "representative-room";
  fixtureId: "v2-room-slice-1";
  buildInputsSha256: string;
  glbSha256: string;
  sidecarSha256: string;
  validatorSha256: string;
  roomStressMapSha256: string;
  generatorSeed: 1592594996;
  population: 64;
  roomWidth: 48;
  roomHeight: 32;
  payloadBytes: number;
  estimatedGpuBytes: number;
}>;
```

Schema 2 otherwise preserves v2-08 metadata, backend diagnostics, sample shape,
summary, rejection reasons, live frame metrics, visibility/hardware/software checks,
and completion-only download. Greybox schema 1 continues to parse/export unchanged.

Predeclare and perform this exact foreground order on the same named reference
machine, browser build, driver, power mode, and display setup:

1. `?stress=greybox&renderer=canvas` — initial procedural Canvas2D drift control.
2. `?stress=room&room=representative&renderer=auto` — accept only selected WebGPU.
3. `?stress=room&room=representative&renderer=webgl2` — require WebGL version 2.
4. `?stress=greybox&renderer=canvas` — repeated procedural Canvas2D drift control.
5. `?stress=greybox&renderer=auto` — final procedural greybox WebGPU comparison.

Slots 1/4 detect machine drift; slot 5 measures whether the representative asset
cost, not a different machine interval, caused the delta. No out-of-order or
provisional artifact fills a slot. WebGPU room p95 must be at most `16.67 ms`; forced
WebGL2 room p95 at most `33.33 ms`. Canvas drift passes only when repeated-control
p95 differs from initial-control p95 by at most `0.50 ms` and repeated-control
`framesOver33_33Ms / sampleCount` differs by at most `0.005` absolute. These values
are predeclared here and repeated in `docs/performance/v2-room-matrix.md`; they may
not be chosen after capture. The previous v2-08 waiver is historical context, not a
room pass.

Raw JSON goes under `docs/performance/evidence/YYYY-MM-DD-v2-room-<slot>.json`; the
dated Markdown record links all five SHA-256 identities, records chronology,
threshold calculations, asset/build hashes, selected backends, rejection reasons,
and the decision. Automated/hidden/software browser runs are smoke only.

## Manual correctness and art gate

Before performance capture, a user reviews visible foreground pages on both
auto-selected WebGPU and forced WebGL2. Capture fixed 1920x1080 screenshots from the
same fixed camera plus a debug-only free-camera review route that is excluded from
performance and normal gameplay. The debug camera is implemented as a bounded,
dispose-owned review control; it never changes snapshots or commands.

`client/src/render/room-review-camera.ts` exports
`createRoomReviewCamera(scene, canvas, bounds)` with `resetFixed()`, `setFree(bool)`,
and idempotent `dispose()`. Fixed mode uses the committed v2 isometric pose. Free mode
uses Babylon `ArcRotateCamera`, clamps alpha/beta/radius and target to the 48x32 room,
attaches only to the active canvas, and removes every observer/input on reset or
dispose. The sentence test
`the_room_review_camera_is_bounded_resettable_and_dispose_owned` exercises the real
NullEngine camera and observer lifecycle.

The exact query is `roomCamera=fixed|free`, valid only with
`room=representative`; absence means `fixed`. `v2.ts` rejects any other value and
rejects `roomCamera` on procedural/Canvas routes. `web/v2.html` exposes a review-only
Fixed/Free toggle beside the room diagnostics. Performance Start is enabled only in
fixed mode and switching to free during a capture is blocked. The query and toggle
both call the same `setFree(bool)` owner, and disposal removes the control listeners.

The matrix exercises: every kit piece from top/back/side; straight/inside/outside/end
joins; floor seams; door open and shut; torch bracket, fixture-origin light and
shadow; current/remembered/unknown transitions; reset and epoch replacement; picking
only current disclosed objects; backend parity; resize; context/device loss; asset
404, malformed sidecar, hash mismatch, decode failure, and disposal during delayed
load. Screenshots include backend diagnostics and the manifest/GLB hashes.

The minimum replacement threshold is the preserved
[`2026-08-08-legacy-renderer-reference.png`](../performance/evidence/2026-08-08-legacy-renderer-reference.png),
SHA-256 `ef249c666d7c4eabb775dc32fbe943076454e2d26db88967b690df0a3ab05260`, specifically its clearly
bounded playfield, restrained dark navy palette, subtle structural grid, readable
depth, and high-contrast unit/target hierarchy. The ultimate target remains
`web/assets/CONCEPT.png`; passing old-version parity does not complete painted-art
acceptance. Side-by-side review records `pass`, `replace`, or `stop` independently
for stone modeling, material response, fixture-origin light, join coherence, depth
readability, and silhouette contrast. The first review recorded `replace`: the 48 x
32 room formed a dense, very dark purple/black mass, joins and depth were difficult
to parse, torch cues did not organize the scene, and unit markers dominated. This is
not a pass and does not claim a performance result.

Composition review is now separate from load testing. The exact 48 x 32
`?stress=room` fixture remains unchanged for performance. The compact query family is
`/v2.html?review=room&room=representative&backend=auto|webgl2&roomCamera=fixed|free`.
It creates no Worker and exposes no performance capture. Its snapshot is exactly 16
x 10 tiles: a perimeter-only 48 solid tiles around a 14 x 8 open interior, two doors
showing open and shut, four torches, four each of barrels, rubble, and roots, and
eight unit markers. Camera bounds derive from that explicit 16 x 10 snapshot.
Review-only rendering uses a dark-navy clear color plus one non-shadow hemispheric
fill and injects initial/reset fixed zoom `1.6`; ordinary and 48 x 32 stress retain
zoom `1`. At 16:9 the tested orthographic top/bottom are `+/-8.125`, every ground
corner retains at least 20 CSS pixels of margin, and the room spans at least 60% of
both viewport axes. The performance fixture retains exactly nine lights. The sentence test
`the_compact_room_review_fixture_is_not_the_performance_stress_fixture` is green.

The texture-inclusive generator-v3 artifact, corrected wall orientation, socket flame
cues, compact framing, dark-navy clear, and bounded review fill address the diagnosed
readability causes without changing simulation or disclosure semantics. They are a
candidate, not a claimed visual success. Visible review must compare the same compact
composition on WebGPU and forced WebGL2 against the preserved minimum reference and
ultimate concept direction. A frame-rate pass does not imply an art pass, an art pass
cannot waive performance, and only an explicit owner decision may accept a measured
exception.

## Exact automated acceptance tests

Add these sentence-named tests to `tools/validate_assets.test.js`:

```text
the_room_glb_and_sidecar_match_the_pinned_manifest
two_clean_pinned_blender_exports_are_byte_identical
the_room_asset_rejects_external_payloads_extensions_and_unbounded_counts
every_room_piece_has_identity_source_transform_finite_bounds_and_allowed_material
the_torch_socket_has_one_parent_and_a_finite_normalized_transform
payload_and_conservative_gpu_estimates_use_the_documented_formula
malformed_glb_chunks_sidecars_hashes_and_duplicate_names_fail_closed
```

Add these to `client/test/render-contract.test.mjs` using injected fetch, loader,
container, scene, and delayed-promise seams — never network or a real GPU:

```text
room_sidecar_runtime_decoding_rejects_every_malformed_or_unbounded_field
room_asset_loading_verifies_mime_magic_hash_and_semantics_before_attachment
room_asset_loading_rejects_external_resources_and_disposes_every_partial_object
disposing_during_delayed_room_load_cannot_attach_or_leak_the_container
room_startup_finishes_asset_loading_before_worker_init_input_or_capture_readiness
room_loader_failure_is_terminal_and_never_silently_selects_procedural_geometry
room_instances_need_known_topology_and_current_furniture_disclosure
remembered_room_tiles_have_no_furniture_light_shadow_pick_or_debug_presence
unknown_room_tiles_leave_no_enabled_spatial_instance_or_registry_residue
room_reset_epoch_change_and_absence_retire_every_instance_and_pick_registration
room_source_meshes_stay_hidden_and_do_not_count_as_visible_presence
room_door_torch_socket_and_wall_orientation_use_only_general_semantic_rules
room_renderer_disposes_presentations_assets_scene_and_engine_exactly_once
room_context_and_device_loss_stop_input_pause_simulation_and_release_assets
the_fixed_room_stress_fixture_has_the_named_asset_hash_population_and_piece_counts
room_performance_schema_two_rejects_wrong_fixture_hash_or_nonlive_frame_metrics
greybox_performance_schema_one_remains_byte_compatible
vite_dev_and_build_serve_the_pinned_room_json_and_glb_with_exact_mime_and_magic
the_gltf_loader_is_a_lazy_dynamic_chunk_outside_the_initial_route_closure
```

The loader tests also inspect real Babylon scene collections after disclosure
transitions, not only shared pure predicates. Build tests assert the glTF loader is
in a dynamic chunk absent from `v2.html` modulepreloads and the initial static import
closure. A dev-server request log proves ordinary and Canvas startup never request
that chunk before `room=representative`. The main thread still never instantiates
wasm, raw TypeScript is absent,
the legacy page/assets are not overwritten, and only the two pinned room outputs are
copied.

## Verification

The automated implementation is green. The generated room has build-input SHA-256
`b63c1075e84368ec98c3ea0bb5d8767ce77494d360ae38df38456b27892dc969`, GLB
`a680684f40ddce4164d8627b8fcee927af24f4f6c49198e95eadf12bbaf93449`, sidecar
`f2c4ffd8db9ffcd31b88a8824fac5b7e7dca76d15e6768d1f809d6802ea114b5`, validator
`b32b32e6792f613b3a6d8349b43df62b5c67a511d996fb7152046d190ac6a939`, and stress-map
`1262c7dc5eb359a06db10a06c85e2782237b226e423a903f72441f1dfde18e6c`.
The validator records zero errors and warnings; the 954,024-byte payload has a
6,534,784-byte deterministic offline residency estimate. The renderer contract suite
passes 53 of 53 tests. The earlier pre-replacement Chrome functional smoke proved
both GPU backends could render the authored-room pipeline, but it predates the current
texture, framing, topology, and flame candidate and is not visual evidence for it.
These facts do not complete the visible art or performance gate.

```powershell
node tools/check_deps.js
node --test tools/check_deps.test.js
node tools/check_toolchain.js
node --test tools/check_toolchain.test.js
.\.tools\blender-4.5.12\blender-4.5.12-windows-x64\blender.exe --background --factory-startup --python tools/art/build_slice.py -- --verify
node tools/validate_assets.js web/assets3d/room_slice.glb --sidecar web/assets3d/room_slice.json --manifest tools/art/manifest.json --report web/assets3d/room_slice.validator.json
node --test tools/validate_assets.test.js
npm run check
node --test client/test/render-contract.test.mjs
node --test client/test/worker-protocol.test.mjs
npm run build
cargo test
node --test tools/wasm_check.js
node tools/check_docs.js
node --test tools/check_docs.test.js
git diff --check
```

After the automated gates, run the dev/prod root-host GET smoke, the two-backend
manual correctness/art matrix, and only then the five ordered foreground captures.
The automated implementation is complete. The visual gate remains open until the
dated record preserves raw failures and waivers honestly, the user has made the art
decision, and the owner has made the visual-track `pass`, `replace`, or `stop`
decision. Mechanics work may continue independently.
