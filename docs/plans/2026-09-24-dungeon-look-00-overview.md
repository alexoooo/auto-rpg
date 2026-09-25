# Dungeon look 00: overview

The owner sent four concept images for the dungeon (not checked in) and asked whether the
environment's visual fidelity can be improved: "feel free to use Blender or download assets".

## What the concepts show

A dark isometric ARPG, in the line of Diablo:

- near-black surroundings, with warm pools of torchlight on the walls;
- bevelled masonry walls with lit top edges;
- cobbled and flagged floors with dark joints;
- rubble, roots, bones, blood and moss;
- barrels, a mine cart, arched and banded doors, and a portcullis;
- a strong vignette.

The images are pixel art. The camera looks down at roughly 40 to 45 degrees, steeper than ours.

## What the dungeon draws today

`buildDungeonWorld` in `src/dungeon/world.ts`, and `rebuild` in `src/dungeon/main.ts`:

- **Materials:** flat `StandardMaterial` colours -- `"dungeon basalt"` walls, `"worn flagstones"`
  and `"remembered floor"` tiles, `"ironbound doors"`, and the `"exit light"` torus.
- **Walls:** each wall box, one per x-run of `boundary` cells capped at four, *is* its Havok
  collider. About 232 separate meshes on a generated level.
- **Floor:** about 2,000 tile instances, two per floor cell. `present` toggles them one by one for
  fog-of-war.
- **Lights:** one `HemisphericLight "cold vault light"` (0.85) and one
  `PointLight "wanderer lantern"` (1.8, range 18) held 5 m over the hero.
- **Missing:** no environment texture, shadows, post-processing, textures or props.
- **Camera:** an orthographic `FreeCamera` at exactly 30 degrees of elevation on the +X+Z
  diagonal (`frameDungeon` in `src/dungeon/camera.ts`).

## What the repo already has and the dungeon does not use

- **Post-processing:** `forgePost` in `src/forge-style.ts` -- a `DefaultRenderingPipeline` with
  ACES, exposure 1.15, contrast 1.12, vignette 1.35 and bloom. `src/art-proof/main.ts` adds an
  `SSAO2RenderingPipeline` (ratio 0.5, radius 0.16, strength 0.8, 8 samples). Babylon 9.18's
  SSAO2 shader has an `ORTHOGRAPHIC_CAMERA` path.
- **Flame:** the `proofFire` shader, registered by importing `src/forge-fire.ts`. It is used as a
  billboard with a flickering `PointLight` in `dressForgeRoom` (`src/forge-room.ts`).
- **Environment:** `/assets/env.hdr`, loaded by `HDRCubeTexture` exactly as `buildArena` does.
- **Textures:** Poly Haven CC0 sets in `public/assets/textures/`, registered in
  `src/textures.json` with their source URLs, sha256 hashes and licence. `surface()`,
  `sharedSurface` and `TEXTURED_SURFACES` (`src/surface.ts`, `src/materials.ts`) turn them into
  PBR materials. `slab_tiles` and `stone_wall_05` are already there.
- **Blender:** a pipeline in `scripts/art-proof/build-assets.py`, run by the portable
  `.tools/blender-4.5.12`. It writes a GLB kit that `loadTemplates` in `src/art-proof/assets.ts`
  loads.
- **Many lights:** Babylon 9.18's `ClusteredLightContainer`
  (`@babylonjs/core/Lights/Clustered/clusteredLightContainer.js`). It renders dozens of point
  lights on WebGL2 when the engine has float colour blending. Its lights cast no shadows.

## Sessions

Each session lands green on its own, and the owner looks at each one.

| # | Session | New assets |
|---|---|---|
| 01 | Light and air: PBR surfaces, torches, post-processing, pitch knob | none |
| 02 | Fog-of-war in a material plugin; merged floor and wall meshes; world-metre UVs | none (the flat colours stay until 03) |
| 03 | Stone: Poly Haven CC0 floor and wall sets, compared in play | downloaded CC0 JPGs |
| 04 | A dungeon kit from Blender: masonry, arches, doors, sconces, rubble | `public/assets/dungeon/kit.glb` |
| 05 | Dressing: body-free floor markings and wall dressing | from the 04 kit |
| 06 | Pixel look, an experiment behind `?look=pixel` | none |

Order: 01, then 02, then 03 and 04 (04 bakes 03's maps), then 05 and 06. 06 depends only on 01,
and may go earlier if the owner asks.

**Against depths session 06** (set pieces, `docs/plans/2026-09-23-depths-06-*.md`), which is
waiting on the owner's play of depths 05:
- Its `stampPieces` puts rock inside room bounds: pillars, piers and chamber walls.
- The rules here that read rock inside room bounds are:
  - 01's torch rule, which excludes it, so it is safe as written;
  - 04's `dividerGaps`, which would take a pillar's line for a divider.
- Whichever of the two lands second restates `dividerGaps` against `Room.piece` in the same
  commit, and re-runs `every_standing_divider_has_one_gap` over seeds that carry pieces.

## What must not move

- **Navigation, collision and every figure in the depths tests.**
  - `buildDungeonWorld` builds the same colliders, the same registry and the same doors in every
    session, with `visuals` false **and** true.
  - `the_dungeon_builds_the_same_colliders_with_or_without_visuals`, added in 01, pins them as a
    count and a hash. It covers `world.ts`, which Node loads.
  - Page-only look code (`lighting.ts` and later) is covered by a guard in `rebuild`: the count of
    meshes with a physics body is the same before and after the look is built, or the page
    throws.
  - 01 commits the depths sweeps as `scripts/dungeon/sweep.mjs` and records a baseline. Every
    later session re-runs it, plain and with `--visuals`, and must match to the hundredth.
- **"Cosmetics never carry authority"** and **"The visible room is not the collision arena"**
  (AGENTS.md):
  - A visual wall stands inside the collider cells it dresses.
  - A sconce sits in a rock cell. A torch's flame is translucent light with no body, the
    body-free case AGENTS.md names for scrims, and may hang over the floor.
  - A floor marking is flat.
  - Nothing solid-looking stands on a floor cell.
  - A wall-mounted piece names its wall collider and stands at most `KIT.proud` (0.08 m) past its
    face; 04 states the rule. It is the one tolerance in this plan, and the owner may refuse it.
  - Nothing spans an opening below `ROOM.maxReachHeight` (3.6 m): doors and arches get jambs,
    not lintels.
  - Nothing rises above a wall collider's 2.8 m top: that is below the reach ceiling, with no
    collider around it.
- **Solid floor props** (barrels, carts, crates) are **not in this plan**. They need cells the
  level grid knows about, which belongs with depths session 06's set pieces (`Room.piece`).

## Performance

My Chrome tab gets no WebGL frames, so frame cost is measured on the owner's machine (an RTX 4060
laptop).

- Session 01 adds `__dungeon.look`, a set of runtime switches, plus a GPU-time probe built on
  `EngineInstrumentation`.
- Every session that adds render work hands the owner one console paste. It toggles each feature,
  captures GPU frame time, and repeats the baseline as a control.

## Constants introduced

- **`DUNGEON_LOOK`** in `src/dungeon/lighting.ts`: the light, torch and post numbers, each with
  its reason.
- **`DRESSING`** in `src/dungeon/dressing.ts`: torch spacing and the dressing densities.
- **`CAMERA_PITCH`** in `src/dungeon/camera.ts`: stays at pi/6 unless the owner picks another
  after comparing with `?pitch=`.

## Decisions the owner may want to reverse

- The camera pitch.
- Torch density.
- Which floor and wall textures ship; session 03 ships two of each for comparison.
- Pixel look or full resolution.

None of these is asked about before it can be seen in play.
