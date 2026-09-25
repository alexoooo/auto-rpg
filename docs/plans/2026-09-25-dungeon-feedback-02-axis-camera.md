# Dungeon feedback 02: the camera looks along an axis

The owner: "the rooms are all at 45% angle, which is annoying to walk with WASD, because everything is always
diagonal -- it would be easier to navigate and see what's on the map if the walls were vertically/horizontally
aligned instead".

The rooms are already axis-aligned: every wall runs along x or z. The camera makes them diagonal:
- `frameDungeon` in `src/dungeon/camera.ts` stands it at hero + (20, h, 20);
- WASD moves along the screen's axes (`screenMovement` in `src/dungeon/commands.ts`), so every corridor is walked on
  two keys at once.

This session turns the camera's azimuth into one number and threads it through everything that assumed the diagonal.

## 1. One number: `src/dungeon/camera.ts`

```ts
/** Which way the camera stands from the hero, as a bearing on the ground: `cameraToward` of it is the unit step from
 * the hero toward the camera. Pi stands it at -z, so walls run across and up the screen, screen right is +x and screen
 * up is +z: WASD walks along corridors on one key. Pi/4 is the diagonal every session before this one used, and the
 * page takes `?azimuth=` in degrees to compare. */
export const CAMERA_AZIMUTH = Math.PI;

export const cameraToward = (azimuth: number): Point => ({ x: Math.sin(azimuth), z: Math.cos(azimuth) });
```

- `frameDungeon(camera, hero, zoom, aspect, pitch = CAMERA_PITCH, azimuth = CAMERA_AZIMUTH)`: the position is
  `hero + cameraToward(azimuth) * sqrt(800)` across the ground, at the same height as now. At pi/4 this is exactly
  today's (20, h, 20).
- Rewrite `CAMERA_PITCH`'s doc comment, which says the azimuth "never changes". That sentence is now false.
- **Why pi and not 0.** At 0 the camera stands at +z, and screen right is -x (Babylon is left-handed). At pi the
  screen reads like a map: x to the right, z up.

## 2. Everything that assumed the diagonal

Found by the camera search and checked by grep for `SQRT1_2`, `0.70711`, `TOWARD_CAMERA`, `+x+z` and `frameDungeon`
under `src/dungeon/`. Each place takes a `toward: Point`, which is `cameraToward(azimuth)`:

| where | today | becomes |
|---|---|---|
| `screenMovement(right, up)`, `commands.ts` | diagonal constants | `screenMovement(right, up, toward = cameraToward(CAMERA_AZIMUTH))`: up is `-toward`, right is `(-toward.z, toward.x)` |
| its caller, `DungeonRun.heroMovement` in `run.ts` (`if (mode.keyboard) return screenMovement(...)`) | | passes `this.toward`, a new field beside `pitch`, which the page sets |
| `cutAway(hero, at, pitch)`, `fog.ts` | `along = (dx + dz) / sqrt 2`, `across = (dx - dz) / sqrt 2` | `cutAway(hero, at, pitch, toward = cameraToward(CAMERA_AZIMUTH))`: `along = dx * t.x + dz * t.z`, `across = dx * t.z - dz * t.x` |
| the shader in `fog-plugin.ts` | `(x + y) * 0.70711` | a new ubo uniform `fogToward` (vec2, declared in `getUniforms`' `fragment` string too); `dungeonAlong = dot(dungeonAhead, fogToward)`, `dungeonAcross = dungeonAhead.x * fogToward.y - dungeonAhead.y * fogToward.x` |
| `FogView` and `dungeonFog(...).update(visible, explored, pitch)` | | `FogView.toward`; `update(visible, explored, pitch, toward)`; `bindForSubMesh` writes `fogToward` |
| `world.present(visible, explored, hero, pitch)`, `world.ts` | | adds `toward`; `DungeonRun.present()` passes `this.toward` |
| `flameFade` in `fire.ts` (session 01) | | takes and passes `toward`; `lighting.update` gets it from the page |
| the lantern, `lighting.update` | `hero + behind / sqrt 2` on both axes | `hero + toward * behind` |
| the ambient, `lightDungeon` | `HemisphericLight` direction `(0.3, 1, -0.4)` | `Vector3.TransformNormal(new Vector3(0.3, 1, -0.4), Matrix.RotationY(azimuth - Math.PI / 4))`: Babylon's `RotationY` takes `cameraToward(PI / 4)` to `cameraToward(azimuth)`, so the light keeps its relation to the view (a textbook `x cos - z sin` turns it the other way); `lightDungeon` takes the azimuth |
| `TOWARD_CAMERA`, `facesCamera`, `seen`, the web rule, `validateDressing`, `dressing.ts` | `{1, 1}` | `dressingPlacements(map, seed, densities = DRESSING, toward = cameraToward(CAMERA_AZIMUTH))` and `validateDressing(map, dressing, torches, toward = ...)`; `facesCamera(p) = p . toward >= FACING_MIN`; `seen` steps along `toward`; a web hangs where `into . toward / sqrt 2 >= FACING_MIN` |
| `CUT_AWAY.ahead`, `fog.ts` | 0.35, argued on the diagonal: a wall the hero is pressed against has its face 0.4 m along | re-derived: on an axis that face is 0.28 m along (a human's 0.28 m to the face), and 0.35 gives it 0.896 of `most`, which the dither draws as 12 of 16 pixels dropped. `ahead` becomes 0.32: 0.957 of `most`, the full 13 of 16. The plan's 0.25 broke the 2 cm step test (a step of 0.12 of `most` against its 0.1); 0.32's worst step is 0.094 |

**`FACING_MIN` is 0.35 on the ground.** A face's normal against the camera's view is `cos(pitch)` times its ground
dot with `toward`, and the facing tests ask 0.3 of that: 0.3 / cos 30 = 0.346. A bare `> 0` would let
`?azimuth=170` hang roots on a face scoring 0.17, nearly edge-on (found by review). At pi/4 both axes score 0.707,
and at pi the -z face scores 1 while the x faces score 0.

**Cobwebs double at pi unless the chance is halved.** Two corner kinds qualify at pi, where one did on the diagonal:
on session 03's levels, 0.5 gives 2.84 webs a level on the diagonal and 5.40 at pi (seeds 1-50, Node). The owner said
the thin shapes look fine, so `cobwebsPerRoomCorner` goes from 0.5 to 0.28: 2.86 a level at pi.

**Dressing is baked per level, so it now depends on the view.** The page passes its own azimuth to
`dressingPlacements`. `TOWARD_CAMERA` goes; a constant that is right at one azimuth is the defect this session removes.

**Behaviour at pi:**
- The camera sees faces whose normal is -z. The +-x faces are edge-on and the +z faces are behind their own walls.
- Roots and wall pieces therefore hang on one face in four, the room's far wall, where the concepts put them.
  Session 05 raises the densities with that in mind.
- A web at pi hangs in either corner whose floor lies toward -z. Each is a diagonal quad, facing the camera at 45
  degrees.

**Torches are not re-placed.** `torchPlacements` does not read the camera: a torch on a face the camera cannot see
still lights the room, as it does today. Its flame is behind the wall until the cut-away opens it, and then it fades
(session 01).

## 3. The page: `src/dungeon/main.ts`

`?azimuth=` in degrees, next to `?pitch=`, and taken whole: any finite value, wrapped to [0, 360). Default
`CAMERA_AZIMUTH`. `toward = cameraToward(azimuth)` is passed to:
- `frameDungeon`;
- `lighting.update` and `lightDungeon`;
- `dressingPlacements`;
- `run.toward`.

## 4. Tests

- **`tests/dungeon.test.mjs`:**
  - "screen movement is normalized and remains independent of facing and automatic attacks": its two sign
    assertions are for the diagonal. Rewrite them per azimuth:
    - at pi, right is exactly +x and up exactly +z;
    - at pi/4, the old signs.
  - "keyboard directions project onto screen axes and HiDPI picking is scaled exactly once": loop over azimuths pi,
    pi/4 and 1.0 (an arbitrary one), calling `frameDungeon(..., CAMERA_PITCH, azimuth)` and
    `screenMovement(right, up, cameraToward(azimuth))`. Its projection checks are already view-general.
- **`tests/dungeon-fog.test.mjs`:**
  - the cut-away tests' `wall(along, across, y)` helper builds points along the diagonal. Give it a `toward` and run
    each test at pi and pi/4;
  - the shader test asserts the new `dot(dungeonAhead, fogToward)` text, and that `bindForSubMesh` writes
    `fogToward`. It must go red with the old 0.70711 text restored.
- **`tests/dungeon-masonry.test.mjs`, `the_camera_never_sees_into_the_rock`:**
  - `dir` is built from pitch and azimuth: `[-cos(p) * t.x, -sin(p), -cos(p) * t.z]`;
  - the `face === "x-" || face === "z-"` skip becomes a skip of faces whose outward normal has `. toward <= 0`;
  - **the aim builder learns `x-` and `z-`** (`cell.x - 0.5` and `cell.z - 0.5`). Today it builds only `top`, `x+`
    and otherwise the `z+` side, so at pi a `z-` face would be aimed at the far side of its own cell, rejected as
    unseen, and only tops would be tested (found by review);
  - run at azimuths pi/4 and pi;
  - its `rays > 65_000` floor is per azimuth; take the floor at pi from a measured run, and write the figure in the
    comment.
- **`tests/dungeon-dressing.test.mjs`:**
  - the refusal cases ("face away from the camera", "hang where a nearer wall hides them", "faces away from the
    camera") and the facing check against `frameDungeon`'s camera run at both azimuths;
  - the "nearer wall" fixture: no generated -z face has rock within 3 cells in front of it (seeds 1-50, 1606
    faces), so it is built by one stated edit: take a real -z face and turn the floor cell 2 in front of it to rock;
  - `validateDressing(map, dressingPlacements(map, seed, DRESSING, t), torchPlacements(map, seed), t)` is clean for seeds 1-50 at both azimuths;
  - the web facing check measures the web quad's normal against the camera's forward at each azimuth, exactly as the
    root check does.

## 5. Verify

- `npm test`, `npm run check`, `npm run build`.
- The sweep: identical to the baseline, plain and `--visuals`. Dressing placement is page-only and the hero's route
  does not go through `screenMovement`.
- **Mutations**, each going red:
  - `screenMovement` right as `(toward.z, -toward.x)`;
  - `cutAway` along `dx * t.z + dz * t.x`;
  - the shader keeping `0.70711`;
  - `facesCamera` `>= 0` (an edge-on face accepted);
  - `seen` stepping along `{1, 1}`;
  - `frameDungeon` ignoring `azimuth`;
  - the lantern at `+x+z`.

## 6. Owner's checklist

- `?play=dungeon`: walls across and up the screen, and a corridor walked on one key.
- `?azimuth=45`: the old diagonal, for comparison.
- `?azimuth=170` or `190`: a small yaw that shows a sliver of the side walls' faces. If the owner prefers it,
  `CAMERA_AZIMUTH` changes to it. `FACING_MIN` keeps dressing off the side faces, which at 10 degrees still score
  only 0.17.

## What landed

As planned above, at `CAMERA_AZIMUTH = Math.PI`, with these differences and figures.

- **`CUT_AWAY.ahead` is 0.32, not 0.25** (the table above says why). The pressed-wall case is now a test: in
  `a_wall_in_front_ghosts_around_the_hero_and_the_opening_has_no_edge`, a wall 0.28 m toward a square camera
  (0.40 m on the diagonal) drops as many of the 16 dither pixels as the heart does, counted by the shader's own
  rule (a pixel whose Bayer value k / 16 is below the share).
- **Cobwebs:** 2.86 a level at pi with the chance at 0.28, against 2.84 on the diagonal at 0.5 (seeds 1-50, Node).
  Roots stay at 6 a level at both azimuths.
- **Masonry rays** (`the_camera_never_sees_into_the_rock`, Node): 56,050 at pi, floor 52,000; 69,558 on the
  diagonal, unchanged, floor 65,000. None sees into the rock at either.
- **Tests added beyond the plan:**
  - `the_lantern_the_sky_and_the_flames_turn_with_the_camera` builds `lightDungeon` at pi, pi/4 and 1: the lantern
    stands `toward` of the hero, the sky reads the same against the view as it was tuned on the diagonal, and each
    flame binds the fade `flameFade` gives for that view. Before it, nothing loaded `lightDungeon`.
  - `presenting_a_run_writes_its_fog_mask_and_no_golem_is_fogged` sets `run.toward` to the diagonal and checks that
    the fog's view and the keys follow it. At the default the wiring cannot be seen.
  - The dressing tests take `?azimuth=170`: no roots on a side face, which scores 0.17, and a root turned onto one
    is refused. This is the case `FACING_MIN` exists for.
- **A test bug found on the way:** the dressing drawn test measured each hung quad against
  `camera.position - camera.getTarget()`, and a `FreeCamera`'s target is only computed with its view matrix. It read
  (0, 0, 0), which happened to lie roughly behind the framed point on the diagonal; at pi it failed a correct
  placement. The direction is now taken from the framed point.
- **Sweep** (`scripts/dungeon/sweep.mjs`, Node headless harness, default seeds 1-20 and multileg 1-5): identical
  outcomes and simulated times to the session 03 baseline, plain and `--visuals`.
- **Mutations:** 18, all red: the plan's seven (with `facesCamera` both `>= 0` and `> 0`, and `ahead` at 0.25 and
  0.35 added), the web rule reverted to `{1, 1}`, the sky turned the textbook way, the run's keys and `present` dropping
  its view, `world.present` and the fog plugin binding or copying a fixed one, and the flames fading on the default
  view.
