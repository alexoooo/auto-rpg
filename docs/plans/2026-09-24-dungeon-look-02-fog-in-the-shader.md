# Dungeon look 02: fog-of-war in the shader, merged floor and walls

This session enables everything after it.

**The problem.** Fog-of-war today toggles about 1,900 tile instances and about 232 wall meshes, one
by one. That rules out merging, texturing across cells, or dressing walls with kit pieces.

**The change:**
- fog becomes a mask texture read by a material plugin;
- the visible floor and walls become a few merged meshes;
- the wall colliders become invisible.

The colliders do not move: `the_dungeon_builds_the_same_colliders_with_or_without_visuals` from
session 01 guards it.

## `src/dungeon/fog.ts` (new; Node-loadable, `.ts` imports): the pure part

```ts
/** 0 unexplored, 128 remembered, 255 visible; one byte per cell, row-major like `map.floor`. */
export function fogMask(map: DungeonMap, visible: ReadonlySet<number>, explored: ReadonlySet<number>): Uint8Array
export function fadeDepth(pitch: number): number    // moved from world.ts; tests import it from here
export function boundary(map: DungeonMap, x: number, z: number): boolean   // moved from buildDungeonWorld
export interface WallQuad { cell: Point; face: "top" | "x+" | "x-" | "z+" | "z-" }
export function wallSurface(map: DungeonMap): WallQuad[]
export function validateDungeonVisuals(map: DungeonMap, quads: readonly WallQuad[]): string[]
```

**`fogMask`:**
- A floor cell is 255 if visible, 128 if explored, and 0 otherwise.
- A rock cell takes the **maximum of its eight neighbours' floor values**.
- **This is stricter than today's rule, on purpose.** Today a wall box (an x-run of up to 4 cells)
  shows whole if any floor cell in its `cells` list is explored. The mask shows each wall cell only
  beside explored ground.
  - Measured by the plan's reviewer on seeds 1-10: 59 of 780 shown runs had cells the mask keeps
    dark, and 24 of 275 lit runs had cells below 255.
  - The mask never shows a cell that today's rule hides.

**`wallSurface`** emits, for every `boundary` cell:
- a `top` quad;
- a side quad on each axis face whose neighbour is not a boundary cell.

That is the outer skin of today's boxes.

## `src/dungeon/fog-plugin.ts` (new; Node-loadable)

`world.ts` is loaded by Node, and `buildDungeonWorld(..., true)` runs under `NullEngine` in
`tests/dungeon-physical.test.mjs` and in this session's tests. So this file has:
- `.ts` imports;
- no TypeScript parameter properties (strip-only mode rejects them);
- nothing page-only.

`GolemProceduralSurfacePlugin` in `src/golem/procedural-surface.ts` is the precedent to follow.
Take in particular its note on not redeclaring uniforms that the UBO already carries.

**`DungeonFogPlugin extends MaterialPluginBase`:**
- It is attached per material, never registered globally, so golem materials never get it.
- **Uniforms:**
  - `fogMaskSampler`: a `RawTexture` of `map.size` squared, one channel (`TEXTUREFORMAT_R`),
    `generateMipMaps: false`, `BILINEAR_SAMPLINGMODE`, clamp;
  - `fogSize`;
  - `fogHero` (vec2);
  - `fogBand` (vec3: depth, side margin, dither strength).
- **Fragment, at `CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR`.** `vPositionW` is declared unconditionally
  by `pbrFragmentExtraDeclaration`. This point runs before the prepass writes, so a discard here
  keeps SSAO clean too.
  - `m = texture(fogMaskSampler, (vPositionW.xz + 0.5) / fogSize).r`.
  - `m < 0.02`: discard.
  - Otherwise mix the lit colour toward `vec3(0.035, 0.04, 0.05) + 0.18 * luminance`, by
    `1 - smoothstep(0.5, 1.0, m)`.
- **Foreground cut-away.** With `d = vPositionW.xz - fogHero`, a fragment where
  `0 < d.x + d.y < band.x`, `abs(d.x - d.y) < band.y` and `vPositionW.y > 0.05` is discarded
  when a 4x4 Bayer value at `gl_FragCoord.xy` is below `band.z` (0.8).
  - The rule is per fragment, so only the part of a wall in front of the hero opens.
  - It needs no alpha sort.
- **Uploads.** `present` uploads `fogMask(...)` with `texture.update(bytes)`. `fogHero` is set
  every frame from `framing` in `main.ts`, through a `world.setHero(point)`.

## `buildDungeonWorld` (`src/dungeon/world.ts`)

- **Colliders:** wall boxes, door boxes and the slab are built exactly as now.
  - Every wall collider mesh gets `isVisible = false` and no material. That is fine: the slab
    already works this way, and walls are already unpickable.
  - Door boxes stay visible. There are few of them, and they open.
- **Visual walls:** the quads from `wallSurface(map)` go into `VertexData`.
  - They are chunked into **16x16-cell** groups, one `Mesh` per non-empty chunk, named
    `wall.visual.${cx}.${cz}`. That is at most 16 per level.
  - Normals are per face.
  - UVs are world metres, by the three-branch rule of `mapUvsInMetres` in `src/arena-room.ts`.
    Export it and reuse it, rather than copy it.
- **Visual floor:** one 1x1 quad per floor cell, edge to edge, chunked the same way into
  `floor.visual.${cx}.${cz}`. World-metre UVs, y 0.
- **Materials:**
  - Add two opaque descriptors to `BASE` in `src/materials.ts`:
    - `"dungeon.floor"`, fed by `slab_tiles`;
    - `"dungeon.wall"`, fed by `stone_wall_05`.
  - Add both names to those rows' `consumers` in `src/textures.json`.
  - Why not reuse the existing ones: `TEXTURED_SURFACES.roomWall` carries `opacity: 0.22` (the
    arena's scrim), and `TEXTURED_SURFACES.ground` belongs to the arena palette.
  - `sharedSurface(scene, TEXTURED_SURFACES.dungeonWall)` (whatever name `buildTexturedSurfaces`
    derives; read it) gives one material per scene. The fog plugin attaches to that material
    itself, never to a clone: `surface()` attaches maps only to the original, in the decode
    callback, so a clone taken before decode stays flat for ever.
  - **Doors** keep the session 01 flat PBR, plus the plugin.
- **`present(visible, explored, hero, pitch)`** uploads the mask and updates the doors and the
  exit. It no longer touches walls or tiles.
- **`visuals = false`** builds no visual floor, walls, mask or plugin.
- **Budget:** `a_visual_world_draws_few_meshes` pins 40.
  - At most 16 floor and 16 wall chunks.
  - Against about 232 wall meshes and two instance batches today.
- **Unchanged:** `DungeonRun.present` still hides actors in unseen cells.

## Tests: `tests/dungeon-fog.test.mjs` (new)

- **`the_fog_mask_shows_each_wall_cell_beside_explored_ground`** -- build a level, `reveal` from
  its start, then from two room centres:
  - floor bytes match `visible`/`explored`;
  - every rock byte equals the maximum of its 8 floor neighbours;
  - on seeds 1-10, **no rock cell is shown by the mask that the old per-run rule hid**. The old
    rule is re-derived in the test from the old `cells` lists: the subset direction of the
    measured difference.
- **`the_wall_surface_is_the_outer_skin_of_the_colliders`** -- seeds 1-50:
  - `validateDungeonVisuals` returns nothing;
  - every boundary cell has exactly one `top`;
  - the side quads equal the (boundary cell, axis neighbour that is not boundary) pairs.
- **`a_visual_world_draws_few_meshes`** -- under `NullEngine` with Havok,
  `buildDungeonWorld(scene, generateLevel(1).map, true)`:
  - every wall collider is invisible;
  - at most 40 visible meshes, besides the doors and the exit.
- **`the_dungeon_builds_the_same_colliders_with_or_without_visuals`** passes unchanged.
- **The existing fog check in `tests/dungeon-physical.test.mjs`** (`run.present()` hides enemy
  meshes) passes.

**Mutations:**
- Dilation over 4 neighbours, not 8: red, because corner walls vanish.
- Emitting the buried faces: red, on the side count.
- A quad on a floor cell: red, from the validator.
- Attaching the plugin to a clone: red. Add an assertion that the material the chunks carry is
  the one `sharedSurface` returned.

## Verification

- `npm test`, `npm run check`, `npm run build`.
- `node scripts/dungeon/sweep.mjs --visuals ...` and the plain sweep both match the session 01
  baseline to the hundredth.
- Page check, stepping by hand:
  - no shader errors;
  - the plugin's code is present in the wall effect's fragment source;
  - the mask texture's bytes follow the hero.
- **Owner's checklist:**
  1. Fog edges are now soft. Is remembered ground still readable?
  2. Walls now appear cell by cell beside explored ground, not a whole run at once. Better or
     worse?
  3. The cut-away in front of the hero: does it open walls enough, or too much, at the chosen
     pitch?
  4. Floor and wall texture: seams or visible repetition?
  5. The probe paste. Expect the draw-call drop to show.
