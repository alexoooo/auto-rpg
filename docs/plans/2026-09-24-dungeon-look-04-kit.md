# Dungeon look 04: masonry, doors and sconces

This session gives the walls the concepts' silhouette: courses of bevelled blocks, a coping course
with a lit top edge, dressed quoins at every outer corner, banded doors and iron torch sconces.

## Built procedurally, not in Blender

The plan was a Blender kit: a GLB of wall pieces with baked atlases, placed as thin instances. It
was built as TypeScript geometry instead, in `src/dungeon/masonry.ts`. The reasons:
- **It is a function of the map.** Blocks run the length of a wall rather than one cell at a time,
  so joints stagger across cell edges instead of drawing the grid, and a face of any length is laid
  without stretching a piece.
- **It reuses what sessions 02 and 03 built.** The blocks are quads merged into the same chunk
  meshes, in the chosen `old_stone_wall` material, with the fog, the cut-away and the stone rules
  unchanged. A kit would need its own atlases and a second path through the fog plugin.
- **Node can test it.** Every rule below is checked on the geometry itself, without a GLB, a
  Blender run or a loader.
- **No download, and no binary in the repository.**

What the kit offered that this does not: sculpted chips and baked ambient occlusion per block. If
the blocks read as too clean, that is the case for going back to Blender, for the block faces only.

## The physicality rule

AGENTS.md: "The visible room is not the collision arena". Walls are 2.8 m tall, below the 3.6 m
reach ceiling, so every piece has to stand within a collider. The plan allowed 0.08 m proud of the
face. **The blocks use none of it.**
- A block's face is the collider's face or set back from it, by up to `MASONRY.relief` (0.025 m).
  Quoins and the coping are flush.
- Bevels and joints cut into the rock, never out of it.
- Nothing rises above 2.8 m. The coping is the top course, inside the box, and the lit edge is the
  bevel along its top.
- **Door leaves** are drawn inside their door's collider box.
- **Sconces** use the allowance: the plate, arm and cup stand at most `SCONCE.proud` (0.08 m) off
  the wall, under the flame. The flame itself is session 01's, 0.12 m out and body-free.
- **Nothing spans an opening**, as planned: no lintels. An opening's sides are outer corners, so
  they get quoins, which is what the planned jambs were for.

## `src/dungeon/masonry.ts` (new; Node-loadable)

**`MASONRY`**, all set by eye:
- five courses of equal height, and a 0.36 m coping course on top;
- block lengths drawn between 0.5 and 1.05 m, then scaled to fill the run exactly;
- quoins 0.74 and 0.4 m;
- a 0.035 m bevel on every block edge, and 0.07 m on every edge of a coping block, except along the foot
  of the bottom course, which sits square on the floor;
- relief up to 0.025 m;
- the backing 0.08 m behind the face and its cap 0.12 m below the top, in mortar at 0.15 of the
  stone's albedo.

**`masonry(map)`** lays the blocks:
1. The side quads of `wallSurface` are gathered into runs: one face, one plane, consecutive cells.
2. A run's end is an **outer corner** when its end cell also has a side facing on along the run.
3. Each course is laid end to end. A corner gets a quoin, and the long and short quoins alternate
   by course and between the two faces, so that they interlock.
4. A run too short for its quoins and one block is one stone, as the end of a wall is.
5. At an outer corner the face running along z carries the 45-degree arris bevel. The other ends
   square at the bevel's edge, so the two meet without overlapping.
6. Every draw is a hash of the level's seed, the face, the plane, the course and the position, so a
   level lays the same blocks however it is walked.

**`blockQuads(block, span, seed)`** draws one block: its face, and a bevel on each edge except a
square end and the bottom course's foot, which sits square on the floor. UVs are metres over the
map's span, shifted by an offset of the block's own, so no two neighbours show the same patch of
`old_stone_wall`.

**`masonryQuads(map, span)`** is everything the walls draw:
- the blocks, first, so the backing behind them fails the depth test rather than being shaded;
- a **backing** behind every side, in mortar, so that any joint shows dark stone and not the void
  inside the rock. At the end of a run that is not an outer corner it runs on by its own depth, to
  meet the backing of the face that turns there. It stops at the cap: any higher, and at an outer
  corner it rose through the other face's coping bevel;
- a **sill** under each backing, in mortar on the floor, from the face back to the backing. Each
  joint's end bevels cut a notch down to the bottom course's foot, and the floor's tiles stop at the
  face, so without it the camera looked down a joint to under the level. Where two sills meet at a
  corner, the face running along z takes the square they share, as it takes the arris;
- each wall cell's **top**, drawn back from each side it has by the coping's bevel, so the bevel
  shows;
- a **cap** in mortar under each top, which closes the rock under any gap at a corner. It too is
  drawn back by the coping's bevel, or its corner showed through the arris as a dark shelf. It
  still covers the backing, which stands further back.

About 41 quads a side face: 53,000 to 71,000 triangles a level on seeds 1 to 10 (Node, counting
`masonryQuads`).

## `src/dungeon/world.ts`

- **`mergedQuads`** takes a quad's own UVs where it has them, and a `shade`, which becomes a grey
  vertex colour on every quad in the chunk. That is how the mortar is darker without another
  material or another draw.
- **Walls** are `masonryQuads` unless the surfaces say `masonry: false`.
- **Doors.** The door's collider box is never drawn. Each door has two meshes, both inside the box:
  - `door.<id>.leaf`: six planks of alternating depth, in the doors' wood;
  - `door.<id>.iron`: two bands and a ring pull on each side, in iron.
  - `openNearby` hides both. A world built with `visuals` false builds neither.
- **`sconces(torches)`** merges a plate, an arm and a cup into one iron mesh per torch,
  `torch.sconce.<i>`. Each stays hidden until the floor cell it faces is explored, as its flame
  does. The fog alone was not enough: it reads a fitting's top and underside from that floor cell
  and its front from the wall. The wall shows as soon as a diagonal neighbour is explored, so the
  front of a sconce was drawn without its top. `main.ts` computes the torches once and hands them
  to the lighting and to the world.

## `?masonry=0`

`stoneQuery` reads it, and `DungeonSurfaces.masonry` carries it into the world: the flat wall skin
of session 02, the control for what the blocks cost on the owner's GPU.

## The stone rule (`fog-plugin.ts`)

A top was any fragment facing up more than 0.5, which would now take the coping's bevel (0.71) as
well. It is `STONE_LOOK.topFacing`, 0.9. The coping's up-facing bevel is lit by the same 1.6 as
before. The flat skin keeps its lit band across the top 6 cm of each side face, but only on a face
square to an axis. Otherwise the band lit the top of every coping joint's bevel and each corner's
arris, which gave every joint a bright tip. The masonry's only such faces up there are the coping
fronts, which stop at 2.73 m, below the band.

## Tests: `tests/dungeon-masonry.test.mjs` (new)

- **`every_block_quad_stands_on_or_behind_its_collider_face_and_inside_rock`**, seeds 1 to 10.
- **`courses_tile_every_side_face_with_no_gap_and_no_overlap`**: every course of every side face is
  covered exactly once.
- **`outer_corners_carry_flush_quoins_that_interlock_and_one_arris`**.
- **`joints_stagger_from_course_to_course`**: under 5 % of the joints inside a run sit on the joint
  below.
- **`the_masonry_is_a_function_of_the_level_and_varies_with_its_seed`**.
- **`a_block_reads_its_own_patch_of_the_map_at_the_maps_scale`**.
- **`no_two_drawn_quads_share_a_plane_and_overlap`**: the z-fighting guard, over every quad that
  touches another in its plane.
- **`a_block_is_closed_seen_from_in_front`**: a block's face and bevels, flattened onto the wall,
  tile its rectangle.
- **`nothing_is_drawn_over_or_under_the_copings_bevel`**: neither a top nor a cap.
- **`the_backing_and_cap_stand_behind_every_joint`**, and no backing rises past the cap.
- **`the_camera_never_sees_into_the_rock`**: rays along the camera's view at 30 and 45 degrees,
  aimed at the colliders' skin wherever the camera sees it, densely at cell edges.
  - Back faces are culled, as the renderer culls them.
  - Before a ray meets a quad, it is never deeper into the rock than the cap, and never below the
    floor under a wall. Below the floor over the rock outside the walls is the dark the camera
    already sees there, and is allowed.
  - The cap is the deepest thing meant to be seen. At 30 degrees the view runs edge-on down an
    inner corner's notch at the coping, and meets it about 0.09 m in.
  - It found the joints' notches at the floor, which is how the sill came to be.
- **`the_masonry_keeps_to_its_triangle_budget_and_the_stone_rule_can_tell_its_faces_apart`**: under
  44 quads a side and 80,000 triangles a level. The only up-facing normals are 1 and 0.71, which
  `topFacing` separates.
- **`walls_draw_in_blocks_over_dark_mortar_and_masonry_zero_is_the_flat_skin`**.
- **`a_door_leaf_is_drawn_inside_its_collider_and_goes_when_the_door_opens`**.
- **`a_sconce_is_set_into_the_wall_under_its_flame_and_is_fogged`**: and hidden until its floor is
  explored.

`tests/dungeon-stone.test.mjs` checks the flat skin's axis UVs with `masonry: false`, and the query's
new field. Two tests pass unchanged:
- `the_dungeon_builds_the_same_colliders_with_or_without_visuals` in
  `tests/dungeon-dressing.test.mjs`;
- `a_visual_world_draws_few_meshes_and_every_one_is_fogged` in `tests/dungeon-fog.test.mjs`. It now
  checks the masonry's winding, because a visual world's walls are the masonry by default.

## Mutations

A scratch script, not committed, made one edit at a time, ran `tests/dungeon-masonry`,
`dungeon-stone` and `dungeon-fog`, and restored the file. Every one went red:
- **Masonry:**
  - a proud block;
  - the backing running on at an outer corner (overlaps), and not running on at an inner corner
    (a slit);
  - two arrises at a corner;
  - quoins of one parity;
  - unfitted lengths;
  - courses that repeat;
  - the seed ignored;
  - no per-block UV patch;
  - block UVs off scale;
  - an unshaded backing;
  - a top over the coping's bevel;
  - no low end bevel;
  - the backing too shallow for the joints;
  - the cap through the coping, and the cap through the arris;
  - the backing up to the top;
  - no sill, a degenerate sill, sills overlapping at a corner, and a sill kept to its cell;
  - a sconce never shown, and a sconce shown before its floor is explored.
- **`world.ts`:**
  - a ring outside the door's box;
  - an open door still drawn;
  - a leaf unturned;
  - a cup proud of the wall;
  - a sconce turned the wrong way;
  - the shade dropped;
  - the masonry never drawn;
  - a quad's own UVs ignored.
- **Elsewhere:** `topFacing` at 0.5, and `?masonry=` dead.

The battery found four gaps, and each now has a test:
- the low end bevel, now `a_block_is_closed_seen_from_in_front`;
- the own UVs, now the exact vertex comparison;
- the backing to the top, now an assertion in `the_backing_and_cap_stand_behind_every_joint`;
- a bevelled foot, which the ray test missed because it treated everything below the floor as
  air. Once the test could see it, it found the joints' notches too, which the sill closes. With
  the sill in, a bevelled foot shows mortar rather than the void, so that one is no longer a
  defect, and it was retired.

## Not built

- **The Blender kit**, above.
- **Rubble at the foot of the walls** moves to session 05, with the rest of the dressing.
- **`dividerGaps`** was needed to place jambs. Quoins come from the corners themselves, so it was
  not.

## Measured

- **No page check this session:** the owner's server on 5180 was down, and I start none of my own.
- **Node, `masonryQuads`:** 40.6 to 41.0 quads a side face, and 53,306 to 71,266 triangles a level,
  on seeds 1 to 10.
- **Node, `tests/dungeon-masonry.test.mjs`:** 75,236 camera rays over seeds 1 and 3 at both
  pitches, in 5 to 10 s depending on load. The test requires more than 70,000.

## Owner's checklist

1. Do the blocks and the coping read as the concepts' masonry at play zoom? Too regular, too clean,
   joints too wide or too narrow (`MASONRY.bevel`)?
2. Doors and sconces: the right size against the golems?
3. Is the cut-away still clean against blocks?
4. The cost: the frame counter's `gpu` with `?masonry=0` against the default, in one window size.
