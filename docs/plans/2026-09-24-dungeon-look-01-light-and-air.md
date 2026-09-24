# Dungeon look 01: light and air

No new assets. This session:
- gives the dungeon the arena's light model: PBR, an environment texture, ACES, bloom and
  vignette;
- adds SSAO for contact shadow;
- puts torches on the room walls;
- adds a pitch knob, runtime switches and a GPU-time probe;
- commits the depths sweep script, so every later session can prove navigation did not move.

## `scripts/dungeon/sweep.mjs` (new, committed)

The scratch sweeps used through the depths sessions (`explore04.mjs`, `explore05.mjs`) lived
only in `%TEMP%`.

- **Command:** `node scripts/dungeon/sweep.mjs [--classic] [--visuals] <build>:<seeds>:<cap> ...`,
  where seeds are a list of numbers and ranges, e.g. `default:1-20:120 multileg:1-5:240`.
- **What it does:** walks the hero to the exit on each level with its spawns emptied, the way
  `the_hero_explores_generated_levels_to_their_exits` does, and prints
  `build seed status sim wall`.
- **`--classic`:** builds from `tests/fixtures/classic-dungeon.mjs`. Its cursor is `(9, 60)`, as
  the depths 04 figures were taken.
- **`--visuals`:** builds `DungeonRun` with `visuals = true`, so the visual path is exercised
  headless too.
- **Baseline:** the sweep run at this session's base commit, compared on status and simulated
  seconds. Wall-clock time is never compared, and depths 05 recorded one decimal place, so its own
  figures are a check on the baseline and not the baseline. The baseline is under "What landed".

## `src/forge-post.ts` (new, a leaf)

- **Move `forgePost`** out of `src/forge-style.ts` into this file, with its two side-effect imports
  (`postProcessRenderPipelineManagerSceneComponent`, `depthRendererSceneComponent`).
- **Re-export it** from `forge-style.ts`, so the arena and the bench are unchanged.
- **Why:** importing `forge-style.ts` from the dungeon would drag in `forge-models.ts`,
  `art-proof/assets.ts` and the glTF loaders, measured at about 190 modules.

## `src/dungeon/lighting.ts` (new, page-only)

**`DUNGEON_LOOK`**, frozen, one doc comment per number. These are starting values, set by eye on
the owner's machine; each comment records what was tried and what was kept.

| Group | Value | Reason |
|---|---|---|
| `ambient` | intensity 0.18, diffuse `#7d8fb3`, ground `#1a1614` | a cold fill, leaving the torches to do the work |
| `environmentIntensity` | 0.22, from `env.hdr` | reflections for bronze and wet stone, kept low underground |
| `lantern` | `#ffcf8f`, intensity 9, height 2.6 m, 0.8 m from the hero toward the camera | PBR point lights fall off by inverse square, so the old 1.8 at 5 m lit almost nothing on the PBR golems |
| `torch` | `#ff8a3d`, intensity 6, flicker +-0.6 | |
| `ssao` | ratio 0.5, radius 0.35, totalStrength 1.1, samples 8; `maxZ` derived | |
| `clearColor` | (0.008, 0.010, 0.016) | |
| `fallbackLights` | 2 | |
| `cutoff` | 0.03 | the contribution at which a light's range is drawn |

**Light range and falloff.** `ClusteredLightContainer.IsLightSupported` requires
`FALLOFF_DEFAULT`, which under PBR is inverse-square (`USEPHYSICALLIGHTFALLOFF`). The shader does
not read `range`; the container culls by it, in its light proxy and depth slices.
- **`lightRange(intensity)`** is `sqrt(intensity / cutoff)`, written as a function, not as a
  hand-set number.
  - At `cutoff` the contribution is 0.03, a sixth of the ambient. That distance is 14.8 m for a
    torch at the top of its flicker (6.6), and 17.3 m for the lantern.
- **The tile fit under this camera: `orthographicLightProxy` in `src/dungeon/light-proxy.ts`
  (new; Node-loadable).**
  - `lightProxy.vertex` fits each light's screen rectangle for a perspective camera: it turns the
    light's view position by the sphere's angular size (sin = range / distance), which is right
    only after a divide by w. Under this orthographic camera w = 1, and the rectangle comes out
    short by an amount that depends on the light's depth.
  - The reviewer ran the shader's maths with `frameDungeon`'s matrices (Node): at pitch 30 and
    zoom 10, 260 of 1428 on-screen lights were cut short, one at 2.1 m from the light, where it
    still gives four times the ambient. The first draft divided the range by 0.7, which is a
    margin for one depth and wrong at others.
  - The repair adds a branch to Babylon's GLSL proxy after its perspective fit: when
    `projection[3][3]` is 1 (orthographic), the rectangle is the view position plus and minus the
    range, projected, which is exact. The depth slices need nothing: the container assigns them
    from view depth plus and minus the range, and a fragment finds its slice from its linear view
    depth.
  - The same simulation with the branch (Node, pitch 25 to 65, zoom 6 to 18, range 14.83): no
    ground within range is cut. Without it and without the margin, 758 of 1428 lights were cut at
    pitch 30, zoom 10.
  - `lightDungeon` calls it before the container's proxy material compiles. If a Babylon upgrade
    moves its anchor it throws, and `the_orthographic_light_proxy_patch_finds_its_anchor` goes red
    first.
- **Page check:** the container's compiled proxy effect contains the branch. The owner looks for
  a step at a tile edge in the torchlight, which would mean the fit is still short.

**`lightDungeon(scene, camera, map, torches)`** returns
`{ lantern, clustered, torchCount, look, update(hero, zoom, pitch), refreshFog(explored),
setLook(change), dispose() }`.

- **Ambient:** the hemispheric light `"dungeon ambient"` is built from `DUNGEON_LOOK.ambient` and
  replaces `"cold vault light"` in `main.ts`. `scene.clearColor` moves here as well.
- **Environment:** `new HDRCubeTexture(publicAssetUrl("/assets/env.hdr"), scene, 256, false,
  true, false, true)`, exactly as `buildArena` does, with the same fallback to intensity 0.
- **The post chain** is built by one private `buildPost()`, always in the same order:
  1. SSAO: `new SSAO2RenderingPipeline("dungeon.ao", scene, { ssaoRatio: 0.5, blurRatio: 1 },
     [camera])`;
  2. then `forgePost(scene, camera)`.

  `setLook` **disposes and rebuilds** the chain in that order. It does not detach and re-attach,
  because re-attaching appends the passes at the end of the camera's list, and the "control" row
  would then not be the baseline. Anything later added to the chain (06's pixel pass) is built
  inside `buildPost` as its last stage, for the same reason.
- **SSAO depth:** SSAO fades out over `smoothstep(0.75 maxZ, maxZ, depth)`. So `update` sets:

  `maxZ = (cameraDistance(pitch) + 1 / sin(pitch) + zoom / tan(pitch)) / 0.75 + 1`

  That puts the farthest ground on screen, at the top edge, short of the fade.
  `cameraDistance(pitch)` is `sqrt(800) / cos(pitch)`, exported from `camera.ts`.
- **Torches:**
  - One flame each: a 0.3 x 0.58 m `CreatePlane`, sharing one `proofFire` `ShaderMaterial`, with
    `BILLBOARDMODE_Y`, not pickable.
  - One `PointLight` each, at the placement's `light` point: 0.4 m off the wall face, not at the
    flame. At the flame's 0.12 m, an inverse-square light burns a hot spot into the stone.
  - When `ClusteredLightContainer.IsLightSupported(light)` holds, every torch light goes into one
    container. `addLight` takes them out of `scene.lights`.
  - Otherwise they stay plain lights, and `update` enables only the nearest
    `fallbackLights: 2`. Materials carry four lights: ambient, lantern and two torches.
- **Fog:**
  - `refreshFog(explored)` shows a torch's flame only once the floor cell it faces is explored.
    Otherwise flames floating in the black would give the layout away.
  - Its light stays on. What it lights is hidden by fog anyway, and in 02 it is discarded by the
    plugin.
  - `main.ts` calls it from the throttled `present` branch.
- **Flicker:** a torch clock that advances only while `scene.physicsEnabled`, as
  `dressForgeRoom`'s does.
- **`setLook({ torches, ssao, post })`** removes work:
  - `ssao` and `post` rebuild the chain without that stage.
  - `torches: false` sets the clustered **container's** `setEnabled(false)`, because its member
    lights are not checked for `isEnabled`, and it hides every flame. In the fallback path it
    disables the lights.
  - **What the "torches off" row still pays for:** the container's tile-mask pass keeps running,
    because the scene component checks `isSupported`, not enabled. So that row measures the
    torches' shading, not the clustering.
  - **What the "post off" row keeps:** disposing the `DefaultRenderingPipeline` hands the scene's
    image processing back to the materials, so ACES, exposure, contrast and the vignette still
    apply. The row removes bloom, FXAA and the separate pass.

**Nothing here may add a body, and no Node test loads this file.** So `rebuild` in `main.ts`
counts `scene.meshes.filter(m => m.physicsBody)` before and after `lightDungeon`, and throws if
the counts differ. The census test below covers only `world.ts`.

## Materials move to PBR, in `buildDungeonWorld` (`src/dungeon/world.ts`)

- **The local helper `material`** builds a `PBRMaterial`:
  - `albedoColor = Color3.FromHexString(hex).toLinearSpace()`;
  - `metallic` 0;
  - `roughness` 0.92 for stone and 0.8 for doors;
  - `maxSimultaneousLights = 4`.
- **The exit's emissive** is `#42b998` in linear space, times 3.
  - Its luminance in linear light is 0.381, and bloom extracts what exceeds the 1.1 threshold
    after the 1.15 exposure.
  - So x3 gives 1.32, which glows. The x2.2 first planned gives 0.965, which does not.
- **Node:** `PBRMaterial` constructs under `NullEngine`; the golems' materials already do.
- **No collider change.** Only materials, and the fade depth below.

## Torch placements: `src/dungeon/dressing.ts` (new; Node-loadable, `.ts` imports)

```ts
export const DRESSING = Object.freeze({
  torchSpacing: 7,          // between flames, in metres
  torchHeight: 2.05, torchProud: 0.12,
  torchLightProud: 0.4,
});
export interface TorchPlacement {
  cell: Point; facing: Point; room: number;
  flame: { x: number; y: number; z: number }; light: { x: number; y: number; z: number };
}
export function torchPlacements(map: DungeonMap, seed: number): TorchPlacement[]
```

**The rule:**
- **Candidates.** A candidate is a rock cell R and an axis neighbour F of it, such that:
  - F is floor inside some room's bounds;
  - R lies inside **no** room's bounds;
  - no 8-neighbour of R is a floor cell outside every room.
- **What that excludes:**
  - A room's bounds are the inclusive rectangle of its floor, and never touch another room's
    bounds (checked over seeds 1-50). Divider walls and their arch reveals are rock inside that
    rectangle, so the second condition excludes them.
  - The third condition excludes the rock beside a corridor mouth, which is where a door hangs.
    On seeds 1-50 the nearest torch cell to a door point is 3.16 m.
- **Order.**
  - Candidates are shuffled by `mulberry32((seed ^ 0x70c4ec) >>> 0)`, then accepted greedily
    while no two flames are closer than `torchSpacing`.
  - A per-room cap of four was planned. It changed no level on seeds 1-50, which the mutation
    battery showed, so it went. Spacing alone puts at most five in a room on seeds 1-300.
- **Output.** The result is sorted by `(room, cell.z, cell.x, facing)`. That normalises the order
  only: the accepted set depends on the draw.
- **Count:** measured with this code (the Node harness), 17-27 torches per level on seeds 1-50.
  2 of 518 rooms get none.

**The flame is the body-free case.** It is translucent, emissive light and owns no body, like the
scrims AGENTS.md names. So it may hang over the floor: its centre stands 0.12 m proud, and a
Y-billboard 0.3 m wide swings to about 0.27 m. The sconce that 04 draws under it is a solid, and
keeps the solid rule.

**Depths 06 ordering.** Its `stampPieces` puts rock inside room bounds (pillars, piers, chamber
walls). The second condition already keeps torches off them.

**Where it is called.** `rebuild` in `main.ts` calls `torchPlacements(run.map, seed)` after the
run is built. `DungeonActor.meshes` collects only the meshes made inside each `Golem`
constructor, so flames built later stay out of it.

## Pitch: `src/dungeon/camera.ts`, `run.ts`, `world.ts`

- **`camera.ts`:**
  - `CAMERA_PITCH = Math.PI / 6`;
  - `cameraDistance(pitch)`;
  - `frameDungeon(camera, hero, zoom, aspect, pitch = CAMERA_PITCH)`.
- **`world.ts`:** `fadeDepth(pitch)` is `Math.SQRT2 * (2.8 / Math.tan(pitch) + 1.5)`. That is 8.980
  at pi/6, where the old value was 9. `present` takes `pitch`, and the side margin of 2.5 stays.
- **`run.ts`:** `DungeonRun.pitch`, a public field defaulting to `CAMERA_PITCH`, which `present()`
  passes on. `main.ts` sets it.
- **`main.ts`:** reads `?pitch=` in degrees, clamped to 25-65.
- **Unchanged:** the azimuth, so `screenMovement` and "keyboard directions project onto screen
  axes and HiDPI picking is scaled exactly once" hold.

## Switches and probe: `src/dungeon/look-probe.ts` (new, page-only)

`window.__dungeon.look` exposes two things.

- **`set({ torches, ssao, post })`** calls `setLook`.
- **`gpuTime(frames = 240, timeoutMs = 20000)`:**
  - **Settling:** a switch changes material defines, and shaders recompile. So it waits until
    every enabled, visible mesh and every post process on the camera is ready (`drawnReady`),
    then 30 more frames, before counting.
    - Not `scene.isReady()`. That also asks the invisible colliders, which carry no material, so
      it asks for a default material that is never drawn and never compiles, and it stays false
      for the life of the level. With no `StandardMaterial` import left on the page, it throws
      instead.
    - If frames render and the drawn meshes never come ready, the rejection says that rather
      than blaming a hidden tab.
  - **GPU time:** if `engine.getCaps().timerQuery` exists, it switches on
    `EngineInstrumentation.captureGPUFrameTime`.
    - The counter is the engine's own, so it outlives one reading. The probe therefore reports
      only what `total` and `count` gained during this reading.
    - The counter gains a sample only when a query resolves, which is not every frame.
    - It is in nanoseconds.
  - **`frameMs`:** the mean `getDeltaTime()`. A display holds it at its refresh rate, so without
    `gpuMs` it says only whether a setting drops frames.
  - **Timeout:** it rejects on the timeout, so a hidden tab says so rather than hanging. A hidden
    tab also throttles timers, so the rejection can arrive late.

## Tests: `tests/dungeon-dressing.test.mjs` (new)

- **`torches_hang_in_room_walls_facing_room_floor`** -- over seeds 1-50 of `generateLevel`:
  - every `cell` is rock and inside no room's bounds;
  - `cell + facing` is floor inside the torch's own room;
  - the flame is `torchProud`, and the light `torchLightProud`, off the face at `torchHeight`.
- **`torches_keep_their_spacing_and_stay_off_corridor_mouths`** -- the same seeds:
  - flames are pairwise at least `torchSpacing` apart;
  - no torch cell has an 8-neighbour floor cell outside every room;
  - every level has a torch.
- **`torch_placements_are_a_function_of_the_seed`** -- `deepEqual` across two calls, and different
  between seeds 1 and 2 on the same level.
- **`the_fade_band_is_todays_at_the_default_pitch`** -- `fadeDepth(CAMERA_PITCH)` is 8.980 to within
  0.001 (the hand-set band it replaces was 9, a visual change of 2 cm), and it falls as the pitch
  rises.
- **`the_dungeon_builds_the_same_colliders_with_or_without_visuals`**:
  - under `NullEngine` with Havok, for seeds 1 and 2, with `visuals` false **and** true;
  - lists every mesh with a physics body as one row: name, position and extents to 0.1 mm,
    filter masks, motion type, shape type, friction and restitution;
  - asserts the count and a sha256 of the sorted rows against values pinned from HEAD's own
    `world.ts` at f1ccfed: 242 and 279 bodies.
  - Later sessions keep it. It covers `world.ts`; the `rebuild` guard above covers `lighting.ts`.
  - It does not cover how a door opens (`openNearby`), which the sweeps do: a door that failed to
    open would fail a run.
- **`the_orthographic_light_proxy_patch_finds_its_anchor`** -- patches twice, and the branch is in
  Babylon's proxy source exactly once, after the perspective fit and before the tiles are read
  from it.

## Verification

- `npm test`, `npm run check`, `npm run build`.
- The sweep, plain and with `--visuals`, reproduces the baseline.
- Grep the served `world.ts`, `lighting.ts`, `camera.ts` and `forge-post.ts` on 5180 for the new
  identifiers.
- Page check at `?play=dungeon` in my tab, stepping by hand per AGENTS.md:
  - no console errors;
  - `__dungeon.lighting.clustered` and `torchCount`.
- **Owner's checklist:**
  1. Does the light read as a dungeon: dark, with warm pools?
  2. Are the torches too dense, or too sparse?
  3. `?pitch=30` against `?pitch=40` and `?pitch=45`: which view? Keyboard movement stays
     screen-aligned at every pitch.
  4. The probe paste: GPU milliseconds per row.

## What landed

**Baseline** (Node headless harness, `scripts/dungeon/sweep.mjs`, at f1ccfed). Every run was won.
Simulated seconds:

| Case | Seeds and times |
|---|---|
| generated, `default`, cap 120 | 1: 37.28, 2: 35.98, 3: 34.68, 4: 74.70, 5: 40.43, 6: 30.57, 7: 63.05, 8: 42.32, 9: 40.25, 10: 58.47, 11: 67.92, 12: 43.67, 13: 42.70, 14: 52.12, 15: 84.03, 16: 86.22, 17: 39.18, 18: 59.67, 19: 42.22, 20: 48.15 |
| generated, `multileg`, cap 240 | 1: 147.62, 2: 66.95, 3: 49.47, 4: 155.78, 5: 89.47 |
| `--classic`, `default`, cap 180 | 42: 24.17, 0: 38.92, 1: 31.30, 2: 45.20, 3: 34.52, 4: 39.08, 5: 38.07, 6: 31.67, 7: 23.60, 8: 32.77, 9: 41.03, 10: 49.12 |
| `--classic`, `multileg`, cap 180 | 42: 50.63, 0: 82.72, 1: 54.42, 2: 98.58, 3: 76.93, 4: 80.62, 5: 70.57, 6: 55.88, 7: 53.95, 8: 58.88, 9: 46.20, 10: 106.52 |

**Checked against depths 05's own figures:** seed 1 at 37.3 and seed 7 at 63.1, generated
`default` 30.6-86.2, and `multileg` 49.5-155.8.

**Mutations**, 11 of 11 red:
- torches on dividers;
- torches at corridor mouths;
- `Math.random`;
- the seed ignored;
- spacing ignored;
- a flame not proud;
- the light at the flame;
- the fade margin 1.5 to 1.6;
- a wall moved 1 mm;
- a body on the `visuals` path;
- a door's collide mask changed.

The per-room cap's mutation stayed green, and the cap was removed.

**After review, 7 of 7 red:** friction 0.8 to 0.3; restitution 0.02 to 0.1; a box collider made
a convex hull; the fade margin 1.5 to 1.53; the proxy anchor changed; the branch put before the
perspective fit; the patch applied twice.

**After the change** (Node headless harness, `sweep.mjs`): all 49 cases, plain and with
`--visuals`, reproduce the baseline's status and simulated seconds exactly.

**Page check** (my tab, Intel Iris Xe, frames driven by hand with physics paused):
- 20 torches on the level, all in the clustered container; pipelines `dungeon.ao` then
  `forge.post`; no console errors.
- A rendered frame shows the lit room, the torch pool on its wall, and the lantern on the hero.
- The first probe run found `scene.isReady()` false for ever, which is what moved the probe onto
  `drawnReady` (above).
- `gpuTime` on that GPU, not the owner's, taken while the range still carried the 0.7 margin:
  25.41 ms with everything on, 2.32 with everything off, and 24.43 on the baseline control. Per-switch figures are the owner's paste to run.
- The tile fit, after `orthographicLightProxy`: the container's tile mask read back from the GPU
  (`_tileMaskTexture.readPixels`, 64 x 64 tiles) against each light's exact rectangle, the view
  position plus and minus the range, projected on the CPU. All 17 lights on that level: no tile
  missing, none extra. The projection's `m[15]` read 1, so the orthographic branch is the one
  that ran. Ranges on the page: 14.83 m for a torch, 17.32 m for the lantern.
- The probe reads nothing if frames skip `engine.beginFrame`/`endFrame`, where the GPU timer is
  sampled. The page's render loop runs both; a console loop that calls `scene.render()` alone
  gets `gpuMs: null`.
