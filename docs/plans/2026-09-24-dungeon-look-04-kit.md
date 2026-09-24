# Dungeon look 04: a dungeon kit from Blender

This session gives the walls the concepts' silhouette: bevelled blocks, a coping course, door and
arch jambs, banded doors, torch sconces, and rubble at the foot of the walls. A deterministic
Blender script makes all of it from the textures session 03 chose, so a rebuild is one command.

## The physicality rule for kit pieces

AGENTS.md: "The visible room is not the collision arena". `validateRoomPlacements` refuses an
opaque solid below `ROOM.maxReachHeight` (3.6 m) unless it names an existing collider. Walls are
2.8 m tall, so every kit piece is below that ceiling and has to name a collider. The dungeon's
version:

- **Wall pieces** (blocks, coping, sconces, foot rubble) name the **wall collider** of their rock
  cell. They may stand proud of that collider's face by at most `KIT.proud = 0.08` m.
  - That is the whole of the tolerance, and it is written down here so the owner can refuse it.
  - A sword passing through 80 mm of stone skin or an iron bracket carries no authority either
    way. The rubble is modelled into the wall's own foot for that reason, not scattered on the
    floor.
- **Door leaves** name their door collider. They are drawn inside its box.
- **Nothing spans an opening.** A lintel over a corridor mouth or a divider gap would be a solid
  over floor cells, with no collider, below 3.6 m.
  - So doors and arches get **jambs only**, standing in the rock cells either side.
  - A lintel waits until the owner decides whether openings should get a real collider above
    2.8 m. That would add a body, so it is the owner's call.

- **The wall top is the collider's top.** No piece rises above 2.8 m: that space is below the
  reach ceiling and has no collider around it. So the coping is the top course of the wall,
  inside the box, and the lit top edge of the concepts is a bevel on it.

`validateDungeonVisuals` grows a kit branch: every placement's world AABB lies inside its named
collider's box, inflated by `KIT.proud` on the side faces that face floor and by nothing on top.

## `scripts/dungeon/build-kit.py` (new)

Run it with
`.tools/blender-4.5.12/blender-4.5.12-windows-x64/blender.exe --background --python scripts/dungeon/build-kit.py`,
which is the path `assets/art-proof/README.md` gives. Keep the conventions of
`scripts/art-proof/build-assets.py`:
- Babylon (x, y, z) maps to Blender (x, z, y);
- procedural detail is baked to images;
- `random.seed` is fixed.

It writes:
- `public/assets/dungeon/kit.glb`;
- the atlases `public/assets/dungeon/kit-{color,normal,orm}.png` (2048), kept **outside** the GLB
  and loaded as `Texture`s, so a Node test can parse the GLB from bytes without fetching images;
- `assets/dungeon/kit.blend`, the editable source.

**Pieces**, keyed by mesh name for `loadTemplates`, in metres:

| Key | Shape |
|---|---|
| `block.face.0..2` | a 1 m wide, 2.8 m tall skin of 6 bevelled courses, 0.18 m deep, three chip variants |
| `block.corner.out`, `block.corner.in` | the same courses turned round a corner |
| `block.foot.0..1` | a face variant with rubble fallen against its own foot, within the 0.08 m allowance |
| `coping` | a 1 m cap course, the top 0.2 m of the wall, flush with the face and the collider's top, with a bevelled lit edge |
| `jamb` | a dressed stone pilaster for either side of a corridor mouth or divider gap, 2.8 m |
| `door.leaf` | planks with two iron bands and a ring pull, fitted inside today's door box (0.35 x 2.5 x 3) |
| `sconce` | an iron plate and cup, 0.08 m proud at most; the flame (01's `torchProud`, 0.12 m, body-free) stands just beyond the cup's lip |

**Budget:**
- under 400 triangles per `block.*`;
- the GLB under 1.5 MB.

The script prints the triangle counts, and the commit names them.

## Placement

This happens in `src/dungeon/kit.ts` (new) and `world.ts`.

**Pure placement: `kitPlacements(map, torches)` in `fog.ts` (Node-loadable).** It returns
`{ key, matrix: number[16], collider: string }` rows:
- a `block.face.N` or `block.foot.N` on every side quad of `wallSurface` (N from a cell hash), set
  0.18 m deep so its outer face is at most `KIT.proud` past the collider face;
- a `block.corner.*` where two faces of one boundary cell meet;
- `coping` along every `top` quad's floor-facing edges, inside the collider;
- `jamb`s in the rock cells either side of every door point and every divider gap;
- a `sconce` under every torch.

`kit.ts` only uploads these rows. It loads through `loadTemplates` in `src/art-proof/assets.ts`.
Give that function a root parameter defaulting to `ASSET_ROOT` rather than copying it. Each piece
becomes one thin-instance buffer per 16x16 chunk, and every kit material carries the fog plugin.

**Backing.** Session 02's merged wall quads stay as a backing, darkened and **inset 0.25 m** into
the rock, deeper than a block, so they fill any gap between blocks and never z-fight or cover
them.

**Divider gaps: `dividerGaps(map, rooms)` in `fog.ts`.** `divide` in `src/dungeon/level.ts` cuts
one gap `LEVEL.block` (3 cells) wide per standing divider, often at the room's edge. So a gap is
defined as:
- a maximal run of floor cells inside a room's bounds;
- lying on a line of rock inside the same bounds (the divider);
- with rock or the room's outer wall at each end.

**Doors.** The door box becomes invisible. Its `door.leaf` instance is hidden when the door opens,
by zeroing that instance's matrix scale. Both `openNearby` **and** `present` change: `present`
rewrites `isVisible` for the door boxes on every call today.

## Tests: `tests/dungeon-kit.test.mjs` (new)

- **`the_kit_glb_holds_every_piece`:**
  - load `kit.glb` from bytes (a `Uint8Array` plus `pluginExtension: ".glb"`), as
    `tests/art-proof.test.mjs` does;
  - every key in the table is present, and each is under its triangle budget.
- **`kit_placements_name_a_collider_and_stay_within_it`** -- seeds 1-30: the validator returns
  nothing.
- **`every_standing_divider_has_one_gap`** -- seeds 1-50: `dividerGaps` returns
  `generateLevel(seed).metrics.dividers` gaps, each `LEVEL.block` cells long.
- **`the_dungeon_builds_the_same_colliders_with_or_without_visuals`** passes.

**Mutations:**
- A block not inset: red, from the validator.
- A skipped corner: red, on the corner count.
- A `dividerGaps` that requires rock at both ends: red, because gaps at room edges are lost.

## Verification

- `npm test`, `npm run check`, `npm run build`.
- Rebuild the kit twice, and the GLB bytes must be identical. If Blender stamps them, compare the
  parsed JSON chunk instead, and say which.
- The sweeps match the baseline.
- **Owner's checklist:**
  1. Do the blocks and coping read as the concepts' masonry at play zoom?
  2. Doors and jambs: right proportion against the golems? Do the openings want lintels, and so a
     collider above them?
  3. Is the session 02 cut-away still clean against blocks?
  4. The probe paste. The triangle count is named in the commit.
