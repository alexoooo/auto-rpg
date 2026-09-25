# Dungeon look 02: fog-of-war in the shader, merged floor and walls

This session enables everything after it, and it was brought forward as a performance fix: on the
owner's laptop (Chrome, Intel Iris Xe) the render callback took 20.5 ms a frame with the GPU at
8.8, so the cost was CPU work per draw, not pixels.

**The problem.** Fog-of-war toggled about 1,900 tile instances and about 232 wall meshes, one by
one, and every explored wall run was its own draw. That also rules out merging, texturing across
cells, or dressing walls with kit pieces.

**The change:**
- fog becomes a mask texture read by a material plugin;
- the visible floor and walls become a few merged meshes;
- the wall colliders become invisible.

The colliders do not move: `the_dungeon_builds_the_same_colliders_with_or_without_visuals` from
session 01 guards it.

**Built as planned, except:**
- **No textures yet.** The floor and walls keep session 01's flat PBR colours. The textured
  descriptors this plan first gave to 02 moved to session 03, which chooses the dungeon's stone
  anyway. Loading them here would also have put `surface()` and its image loads into `world.ts`,
  which Node loads.
- **The floor keeps its grid.** Tiles are still 0.98 m at y 0.015, merged rather than instanced,
  so the 2 cm gaps still draw the grid the floor reads as. Edge-to-edge tiles wait for a texture.
- **UVs are computed while the quads are built**, by the rule `mapUvsInMetres` in
  `src/arena-room.ts` applies. Importing that file would put the arena room's graph into
  `world.ts`'s Node graph.
- **Doors are drawn whenever they are closed**, and the mask hides them where it is dark. The old
  rule spread every explored cell into an array once per door.
- **Drawing is decided per cell, not by the filtered mask.** The first build discarded wherever
  the bilinear sample fell below 0.02, and review measured what that drew: the edges of unexplored
  tiles, including past a one-cell wall, and every closed door in the remembered tint, since sight
  stops at a door and never explores its cells. `FOG_SAMPLE` in `fog.ts` holds the rule, and
  `fogSample` repeats it on the CPU for the tests.
- **WebGL2 only.** `texelFetch` and the one-channel mask need it, as SSAO2 already does. The
  uniforms are also declared for a context without uniform buffers, but nothing tests that path.
- **The mask's size rides in `fogBand.w`**, not a separate `fogSize`.

## `src/dungeon/fog.ts` (new; Node-loadable): the pure part

```ts
export const FOG = { unexplored: 0, remembered: 128, visible: 255 };
export function fogMask(map, visible, explored, into?): Uint8Array   // row-major like `map.floor`
export const FOG_SAMPLE = { pull: 0.2, drawnFrom: 0.02 };
export function fogSample(map, mask, x, z, nx?, nz?): { drawn: boolean; lit: number }
export function doorCells(door): Point[]            // the three cells a door box stands in
export function fadeDepth(pitch: number): number    // moved from world.ts
export function boundary(map, x, z): boolean        // moved out of buildDungeonWorld
export const SIDE_FACES                              // x+, x-, z+, z- with their offsets
export interface WallQuad { cell: Point; face: "top" | "x+" | "x-" | "z+" | "z-" }
export function wallSurface(map): WallQuad[]
export function validateDungeonVisuals(map, quads): string[]
```

**`fogMask`:**
- A floor cell is 255 if visible, 128 if explored, and 0 otherwise.
- A rock cell takes the **maximum of its eight neighbours' floor values**.
- **This is stricter than the old rule, on purpose.** A wall box (an x-run of up to 4 cells)
  showed whole if any floor cell in its `cells` list was explored. The mask shows each wall cell
  only beside explored ground, and never shows a cell the old rule hid.
- A closed door's three cells take the maximum of their own value and their eight neighbours'
  floor values, so a door shows like a wall beside the ground it is seen from. Those cells are
  floor, and their 0.98 m tiles are drawn with the 0.35 m door, so a strip of plain floor shows past
  its far side. It tells nobody anything the door did not.

**`wallSurface`** emits, for every `boundary` cell, a `top` quad and a side quad on each axis face
whose neighbour is not a boundary cell. That is the outer skin of the collider boxes. Faces into
solid rock are kept, as the boxes had them: rock beyond the boundary is drawn as nothing, so such
a face can be seen past it.

## `src/dungeon/fog-plugin.ts` (new; Node-loadable)

`world.ts` is loaded by Node, and `buildDungeonWorld(..., true)` runs under `NullEngine` in the
tests. So this file has `.ts` imports, no TypeScript parameter properties and nothing page-only,
following `GolemProceduralSurfacePlugin` in `src/golem/procedural-surface.ts`, including its note
on not redeclaring the uniforms the UBO already carries.

**`DungeonFogPlugin extends MaterialPluginBase`:**
- Attached per material by `dungeonFog(scene, map).attach`, never registered globally, so golem
  materials never carry it.
- **Sampler:** `fogMaskSampler`, one `RawTexture.CreateRTexture` of `map.size` squared, unsigned
  bytes, bilinear, no mipmaps, clamped.
- **Uniforms, in the UBO:** `fogHero` (vec2) and `fogBand` (vec4: cut-away depth, side margin,
  dither share, mask size).
- **At `CUSTOM_FRAGMENT_MAIN_BEGIN`, before any lighting is paid for:**
  - The fragment reads from `p = vPositionW.xz - 0.2 * vNormalW.xz`, pulled into the solid it
    belongs to: a wall face 0.3 m into its own cell, a door's broad face to within 0.025 m of its
    cell's centre. Half a cell would have tinted a door from the ground behind it.
  - **Discard** when `texelFetch` of the cell `p` is in reads below 0.02: unfiltered, so no pixel
    of a hidden cell is drawn.
  - `m = texture2D(fogMaskSampler, (p + 0.5) / fogBand.w).r`, bilinear, is the tint alone.
  - **Foreground cut-away.** With `d = vPositionW.xz - fogHero`, a fragment where
    `0 < d.x + d.y < fogBand.x`, `abs(d.x - d.y) < fogBand.y` and `vPositionW.y > 0.05` is
    discarded when a 4x4 Bayer value at `gl_FragCoord.xy` is below `fogBand.z`. Per fragment, so
    only the part of a wall in front of the hero opens, with no alpha sort.
  - Both discards come before the prepass writes, so they leave nothing in the SSAO input.
- **At `CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR`:** the lit colour is mixed toward
  `vec3(0.035, 0.04, 0.05) + 0.18 * luminance` by `1 - smoothstep(0.5, 1.0, m)`. That is after the
  material's image processing, which is linear while `forgePost` does it, and gamma only if the
  look probe turns post-processing off.
- **`FOG_LOOK`** holds those numbers: the memory colour, the side margin of 3.5 (in `x - z`
  units, about 2.5 m either side) and the dither share of 0.8, 13 of 16 pixels dropped.
- **Updates.** `present` writes the mask with `texture.update(bytes)` and the depth from
  `fadeDepth(pitch)`. `framing` in `main.ts` calls `run.world.setHero(hero)` every frame, since
  `present` runs every 100 ms.

## `buildDungeonWorld` (`src/dungeon/world.ts`)

- **Colliders:** wall boxes, door boxes and the slab are built exactly as before. Every wall
  collider has `isVisible = false`. Door boxes are drawn until they open.
- **Visual walls and floor:** quads merged into one `Mesh` per **16x16-cell** chunk
  (`VISUAL_CHUNK`), named `wall.visual.${cx}.${cz}` and `floor.visual.${cx}.${cz}`, with
  per-face normals and frozen world matrices. Each quad's winding is chosen from its normal:
  Babylon's front face is the one whose right-handed edge cross product points away from it.
- **Materials:** the session 01 flat PBR stone, floor and door materials, each with the plugin.
- **`present(visible, explored, hero, pitch)`** writes the mask and shows the exit once its cell is
  explored. It no longer touches walls, tiles or doors.
- **`visuals = false`** builds no visual floor or walls, no mask and no plugin.
- **Unchanged:** `DungeonRun.present` still hides actors in unseen cells.

## Tests: `tests/dungeon-fog.test.mjs` (new)

- **`the_fog_mask_shows_each_wall_cell_beside_explored_ground`:** on seeds 1-10, reveal from the
  start and then from two rooms' centres. Floor bytes follow `visible`/`explored`, every rock byte
  is the maximum of its 8 floor neighbours, and no rock cell shows in a run the old rule hid.
- **`the_wall_surface_is_the_outer_skin_of_the_colliders`:** on seeds 1-50, the validator finds
  nothing, every collider cell has exactly one top and nothing else does, and the side quads are
  the (collider cell, axis neighbour that is not a boundary cell) pairs.
- **`validateDungeonVisuals_refuses_a_quad_off_the_colliders_and_a_quad_drawn_twice`.**
- **`the_shader_draws_no_pixel_of_unexplored_ground_and_lights_a_door_beside_the_hero`**, through
  `fogSample`, on seeds 1-10:
  - no point of an unexplored tile is drawn, other than a closed door's own cells;
  - every point of a wall face is drawn exactly when its own cell is shown, counted only on faces
    whose two sides differ, since only those can tell;
  - a closed door's broad face, seen from the ground beside it, is drawn and lit above 0.9.

  The shader is not run by any test. It and `fogSample` must be changed together, and only the
  page check below shows that it compiles. **`the_fog_shader_samples_as_fogSample_does`** is a
  tripwire, not a proof: it reads the hand-copied expressions out of the plugin's fragment code.
- **`a_visual_world_draws_few_meshes_and_every_one_is_fogged`:** under `NullEngine` with Havok,
  every collider is invisible, only the merged surfaces are drawn besides the doors and the exit,
  at most two per chunk and at most 40. Every surface and door carries the plugin reading the
  level's mask, and Babylon's `ComputeNormals` agrees with every authored normal.
- **`presenting_a_run_writes_its_fog_mask_and_no_golem_is_fogged`.**

**Mutations, all red:** dilation over 4 neighbours, buried faces emitted, a blind validator,
visible read as remembered, winding flipped, doors left unfogged, colliders drawn, `present`
writing no mask; then a pull of 0 and of half a cell, the discard taken from the filtered sample,
closed doors left out of the mask, door cells dilated over 4 neighbours, and the shader's
rounding and tint coordinate each losing their `+ 0.5`.

## Measured

- **Node headless harness, `NullEngine`,** CPU time of one `scene.render()` after 8 s of the hero
  exploring, seeds 1-3: 1.37-1.66 ms before, 0.28-0.33 ms after. Active meshes went from 360-408
  to 149-224, and the scene from about 2,900 meshes to about 1,000.
- **The page, in Chrome in a hidden tab, stepped by hand:** the wall, floor and door effects
  compile on WebGL2 with no error, and their fragment source carries the `texelFetch` discard. At the start of seed 1
  a frame is 100 draw calls. Of its 88 meshes, 16 are surfaces and 66 are the hero golem's own
  parts, which makes golems the next thing to merge.

## Verification

- `npm test`, `npm run check`, `npm run build`.
- **Owner's checklist:**
  1. The frame counter, as before: does `other` fall?
  2. Fog edges are now soft. Is remembered ground still readable?
  3. Walls now appear cell by cell beside explored ground, not a whole run at once. Better or
     worse?
  4. The cut-away in front of the hero: does it open walls enough, or too much, at the chosen
     pitch?
