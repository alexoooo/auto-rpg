# Dungeon look 05: dressing

This session adds the concepts' clutter without giving any of it authority:
- **Flat floor markings:** blood, cracks, moss, puddles and a printed bone scatter.
- **Hung growth:** roots down wall faces, and cobwebs across rooms' inner corners.

None of it owns a body, and none of it looks solid where a golem walks.

## Painted in code, not baked in Blender

The plan put the decals in a `kit-decals.png` baked by `build-kit.py`, and the roots and webs in
that kit as thin instances. Session 04 replaced the kit with procedural geometry, so there is no
kit to extend. The dressing follows it:
- **One atlas, painted in code.** `decalAtlas()` in `src/dungeon/decals.ts` returns the RGBA bytes
  of a 4x2 atlas of 256-pixel tiles, one per kind. `world.ts` wraps them in a `RawTexture`. There
  is no download, no binary in the repository, and Node can test every pixel.
- **Quads, merged.** Every piece is a quad through `mergedQuads`, with the UVs of its kind's tile.

What a baked atlas would offer that this does not: painterly detail. If the markings read as
clip art, that is the case for a CC0 decal set with its provenance recorded as in session 03.

## The physicality rule

- **Markings** are flat floor markings, which AGENTS.md names as body-free. They lie 4 to 8 mm
  over the tiles.
- **Roots** hang on a wall's face, `hungProud` (0.01 m) off it: inside the 0.08 m allowance
  session 04 gave the sconces, and below the wall's 2.8 m top.
- **Cobwebs** are silk. They are alpha-tested, so each strand draws opaque, and they are not the
  translucent scrims AGENTS.md names. They are strands too thin to look solid, though, and a blade
  passing through a web is what a web allows. Each hangs across a room's inner corner, spans at
  most 0.6 m along each wall, and never hangs below 2.0 m, clear of a golem's head. A raised weapon
  still reaches one, since the arena's reach ceiling is 3.6 m. If the owner reads webs as solid,
  they go.

The plan had each mounted piece name its collider as a string. The rule it stood for is checked
from the map instead: roots must hang on a boundary rock cell facing floor, and a web must sit in
a corner with rock on three sides.

## `src/dungeon/decals.ts` (new; Node-loadable)

- **`DECAL_KINDS`**: the five markings, then `roots` and `cobweb`.
- **`ATLAS`**: 256-pixel tiles, 4 columns, 2 rows, and a 6-pixel `rim` that is never painted, so
  mipmaps and clamping never bleed one tile into the next.
- **`atlasRect(kind)`**: the tile's `[u0, v0, u1, v1]`.
- **`decalAtlas()`**: each tile painted by its own painter from `mulberry32(0xdeca1 + i)`.
  - Colour is sRGB, and alpha is straight. A clear pixel takes the tile's mean colour, so a
    mipmap blends toward the mark and not toward black.
  - Row 0 is v = 0. A hung tile's top edge is that row, and meets the wall's top.
  - **Strokes are sized for the third mipmap.** At play zoom a 0.5 m web covers about 32 pixels, so
    it samples the atlas's third mipmap, where each texel averages 8x8 of the painted ones. Alpha
    testing a thin stroke there discards it: silk 2.4 to 3.2 pixels wide kept 3.6 % of the tile
    solid at the third mip against 9.7 % painted. The silk is now 7 to 9 pixels, and a root stroke
    stops once it narrows to about 5. That comes to about a pixel on screen.
  - Solid share of each tile (alpha at least 128), painted and at the third mipmap: blood 21.6 and
    21.1 %, crack 5.1 and 4.4, moss 20.6 and 20.9, puddle 32.8 and 33.2, bones 5.9 and 6.3, roots
    14.6 and 14.6, cobweb 18.5 and 19.9 (Node, `decalAtlas()` box-filtered as the GPU builds its
    mips).

## `src/dungeon/dressing.ts`, extended (Node-loadable)

```ts
export type Dressing =
  | { kind: "decal"; decal: FloorDecal; at: Point; size: number; turn: number; layer: number }
  | { kind: "roots"; cell: Point; facing: Point; along: number; width: number; drop: number }
  | { kind: "cobweb"; corner: Point; into: Point; span: number; drop: number };
export function dressingPlacements(map: DungeonMap, seed: number, densities: DressingTable = DRESSING): Dressing[]
export function validateDressing(map: DungeonMap, dressing: readonly Dressing[], torches: readonly TorchPlacement[]): string[]
```

**`DRESSING`**, all starting values set by eye. The owner judges clutter.
- `decalsPerRoom` 3 to 6, and `corridorDecalsPerCell` 0.02.
- `decals`: a weight and a size range per kind. Blood and cracks 0.25 each, moss 0.2, puddles and
  bones 0.15 each.
- `keepClear` 1.2 m around the start and the exit.
- `rootsPerLevel` 6, at least `rootSpacing` 4 m apart, 0.5 to 0.9 m wide, reaching 0.9 to 1.7 m
  down.
- `cobwebsPerRoomCorner` 0.5 of the corners that face the camera, spanning 0.35 to 0.55 m,
  hanging 0.45 to 0.7 m.

**Markings:**
- A marking lies at `decalHeight(layer)`: `FLOOR_TOP` (0.015, the tiles' top, which `world.ts` now
  builds to) plus 4 mm, plus 2 mm a layer.
- Markings whose squares can overlap take different layers, so none z-fight. There are
  `DECAL_LAYERS` (3); a marking with no free layer is redrawn.
- A marking is kept only where its whole square lies on floor and it is clear of the start and the
  exit. Each gets 20 attempts. "On floor" is exact: no rock cell's square overlaps the marking's,
  by separating axes. It first sampled 5x5 points, which let 12 of 2,505 markings on seeds 1 to 50
  overhang rock by up to 0.118 m.

**Hung pieces face the camera.** A hung piece is a single face, culled from behind as the walls are.
When this session landed, `frameDungeon` stood the camera at +x +z of the hero and `TOWARD_CAMERA`
stated that direction; dungeon feedback 02 put the camera square to the walls, and the placement now
takes the page's `toward` and keeps to faces scoring `FACING_MIN` against it.
- Before the rule, only about one web in four could be seen: of 9.26 webs a level, 24 % faced the
  camera, 48 % were edge-on to it and the rest were culled. Only 54 % of roots faced it (Node,
  seeds 1 to 50).
- **Roots** go on boundary faces that look at floor along +x or +z, never at a doorway, at least
  1.5 m from a flame, and at least `rootSpacing` from each other.
- **And where no nearer wall hides them.** A root on a room's far wall, beside the corner of the
  wall nearest the camera, is seen across that wall, and at 30 degrees the sight line rises only
  0.58 m for each metre of floor it crosses. Roots are kept only where the sight line from halfway
  down them, at each end and the middle, clears the walls' top over floor (`rootsSeen`, at
  `CAMERA_PITCH`). Before this, 23 of 300 roots were more than half hidden, and 6.2 % of root area
  was. After it, none are, and 1.2 % of the area is: the bottoms of the longest (Node, seeds 1 to
  50, a 9x9 ray-march on each root).
- **Webs** go by chance in rooms' inner corners whose floor lies toward +x +z, at least 1.2 m
  from a flame. The chance went from 0.35 to 0.5 because only those corners are eligible now.

**Random stream.** Placements draw from `mulberry32((seed ^ 0xd2e55) >>> 0)`, a stream of their
own, so no dressing change can move a torch. `torchPlacements` takes no dressing input, which
makes this true by construction. It is stated here, not tested: a test of it would assert
nothing.

`validateDressing` returns every reason a dressing breaks those rules, one string each. The plan
put this in a `validateDungeonVisuals` branch, but no such function exists: session 04's rules
live in its tests.

Over seeds 1 to 50: no problems. A level has about 50 markings, 6 roots and 3.8 webs, every root
and web facing the camera, placed in 18 ms (Node, `dressingPlacements` then `validateDressing`).

## Rendering (`src/dungeon/world.ts`)

`world.dress(dressing)` builds the atlas and two PBR materials: "dungeon dressing" (roughness
0.95) and "dungeon puddles" (0.12, to catch the torchlight). Both are alpha-tested at 0.5, not
blended, so there is no sorting, and both carry the fog plugin.
- `dressing.floor.*` and `dressing.puddles.*`: the markings, merged by chunk.
- `dressing.hung.*`: the roots, merged.
- `dressing.web.<i>`: one mesh per web, hidden until the floor cell it hangs over is explored, as
  the sconces are. A web's normal points diagonally into the room, so the fog read it as part rock
  and part floor, as it did the sconces.

`main.ts` places the dressing after the sconces. `world.dispose()` leaves the atlas and the two
materials to the scene, as it leaves every other world material: `main.ts` disposes the whole
scene on each new level.

## `?dressing=0`

`stoneQuery` reads it, and `main.ts` then places no dressing: the control for what the dressing
costs on the owner's GPU.

## Tests: `tests/dungeon-dressing.test.mjs`, extended

- **`dressing_is_flat_on_the_floor_or_hung_on_a_wall`**, seeds 1 to 50: the validator returns
  nothing, at least 3 markings lie inside every room's bounds, and every kind is drawn somewhere.
- **`the_dressing_validator_refuses_each_thing_it_is_for`**: one stated edit to a real placement
  per rule. The edits:
  - a marking moved onto rock, put on layer 7, or on the start;
  - a duplicate marking at the same depth;
  - roots moved onto their floor cell, run off their face, hung at a torch, turned away from the
    camera, or hung on a far wall where a nearer one hides them;
  - a web hung down to 1.6 m, turned to face the rock, or turned edge-on to the camera.
- **`dressing_keeps_the_start_and_exit_clean`**: measured to the square itself, not the circle
  the placement rule uses.
- **`every_marking_lies_wholly_on_floor`**: 24x24 points of every marking, sampled apart from the
  placement rule.
- **`dressing_is_a_function_of_the_seed`**.
- **`dressing_density_is_what_the_table_asks`**: with every density doubled, markings, roots and
  webs on seeds 1 to 10 each rise at least 1.6 times.
- **`the_atlas_paints_a_shape_on_a_clear_rim_in_every_tile`**: the rim is clear, 2 to 45 % of each
  tile is solid, the hung tiles meet their top edge while the markings stay off it, and at least
  half of what is solid stays solid at the third mipmap.
- **`dressing_is_drawn_where_it_was_placed_alpha_tested_fogged_and_owns_no_body`**, headless, seeds
  1 and 4:
  - no body is added, and every mesh is fogged and alpha-tested;
  - markings lie between 3 and 20 mm over the tiles, with puddles apart and glossy;
  - each quad samples its own kind's whole tile, and a hung quad has its tile's top at its top;
  - every hung quad faces a camera placed by `frameDungeon`;
  - roots stand within the allowance of their own face;
  - webs stay in their corner, between 2.0 and 2.8 m, hidden until their floor is explored.

`tests/dungeon-stone.test.mjs` checks the query's new field.

## Mutations

A scratch script, not committed, made one edit at a time, ran `tests/dungeon-dressing` and
`dungeon-stone`, and restored the file. 35 went red:
- **Placement:**
  - markings at y 0.1;
  - roots 0.3 m proud;
  - each of the room, root and web densities read from `DRESSING` instead of the table passed in;
  - markings kept off the floor, on one layer, or at the start;
  - markings allowed to overhang rock by 10 cm;
  - webs hanging to 1.3 m, facing the rock, or put in every inner corner whichever way it faces;
  - roots at torches, in doorways, run off their face, on faces the camera cannot see, or where a
    nearer wall hides them;
  - the validator blind to roots or webs that face away from the camera, or to roots behind a
    nearer wall.
- **The atlas:** the rim painted, roots that do not reach their tile's top, and the silk back at
  its first widths (2.4 to 3.2 pixels). Thinning only the rings stays green, because the spokes
  alone keep the web above the test's floor at the third mipmap.
- **`world.ts`:**
  - the fog dropped;
  - webs shown before their floor is explored;
  - roots behind the wall's face;
  - matte puddles, or puddles merged with the rest;
  - blending instead of alpha testing;
  - tiles raised over the markings;
  - every marking drawn from the blood tile;
  - roots or webs hung upside down in their tile;
  - webs facing the wall.
- **Elsewhere:** `?dressing=` dead.

The adversarial review before the commit found what the first battery could not: hung pieces the
camera never sees, silk lost at the mipmaps, hung UVs no test read, and the 5x5 floor sample. A
second review found the roots hidden behind nearer walls. Each now has a test, and the mutations
above for each went red.

## Not built

- **Rubble at the foot of the walls**, which session 04 moved here. Anything standing proud at a
  wall's foot looks solid on the floor, and the masonry's foot sits square on it already. A flat
  rubble marking would be one more kind in the atlas.
- **Standing props:** barrels, carts, crates, standing bones and skulls, and the portcullis. They
  look solid and stand on the floor, so they need cells the level grid owns, and colliders. That
  belongs with depths session 06's `Room.piece`, or a prop-cell session after it.

## Measured

- **No page check this session:** the owner's server on 5180 was down, and I start none of my own.
- **Node:** the placement figures and atlas shares above.

## Owner's checklist

1. Clutter: too much, too little, or right? Name the kind that is off (`DRESSING`).
2. Do the thin shapes (cracks, bones, silk and roots) hold together at play zoom, or break up as
   you zoom out? Up close, is the silk too thick?
3. Do the puddles catch the torchlight?
4. Do the webs read as webs, and the roots as roots? Do the webs look solid? If so they go (see
   the physicality rule).
5. Does anything look solid that the hero walks through? That would be a defect, not a matter of
   taste.
6. The cost: the frame counter's `gpu` with `?dressing=0` against the default, in one window size.
