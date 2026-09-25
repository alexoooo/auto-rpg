# Dungeon look 03: stone

This session puts CC0 stone from Poly Haven on the dungeon's floor and walls and hides its
repetition. The owner asked for downloads.

**Built as planned, except:**
- **Floor and wall are chosen separately.** `?floor=` and `?wall=` each take `a`, `b` or `flat`,
  in place of one `?stone=` pair, so any floor can be seen with any wall. `flat` is session 01's
  colours, as session 02 drew them. It doubles as the control for the probe: the owner's frame
  counter now reads GPU 21.6 ms against 3.4 of `other`, so the texture reads have to be measured.
- **Wall `a` is the arena's `stone_wall_05`**, which was already in the repository. It gains a
  consumer and needs no download.
- **Grime is a colour, not the `mossy_stone_wall` map.** The GPU now limits the frame on the
  owner's machine, and one more sampler on every wall pixel is paid for whether the grime shows
  or not.
- **No roughness variation.** Albedo alone carries it.
- **The lit coping is on the side faces.** It is a band across the top 6 cm of each side face,
  not a line inside the top quad: a top quad does not know which of its edges are exposed, and a
  line on all four would draw the cell grid on every wall top.

## The textures

**The owner chose `b` for both** after playing it, and saw no repetition. `b` is the default; `a` stays
reachable by query until its files leave.

| Surface | Choice | Poly Haven asset | Repeats every | Bytes added |
|---|---|---|---|---|
| Floor | `a` | `cobblestone_floor_06` | 2.0 m | 2,429,090 |
| Floor | `b` | `large_floor_tiles_02` | 3.0 m | 980,617 |
| Wall | `a` | `stone_wall_05` (the arena's) | 2.1 m | none |
| Wall | `b` | `old_stone_wall` | 2.0 m | 2,630,883 |

- **Spans.** Each span is the asset's physical size from Poly Haven's API (`/info/<asset>`,
  `dimensions`, in millimetres). `stone_wall_05` keeps the 2.1 m the arena gave it.
- **Rejected on sight** of the rendered previews:
  - `monastery_stone_floor`, irregular slabs, is kept as a fallback floor.
  - `castle_brick_01` is small red brick.
  - `medieval_blocks_02` is lumpy render.
  - The arena's `slab_tiles` has light joints, where the concepts' joints are dark.
- **Clean-up.** When the owner has chosen, each loser leaves in one commit: its files, its rows
  in `src/textures.json` and its `BASE` entry together. `buildTexturedSurfaces` throws at module
  load for a `BASE` consumer with no rows. If `stone_wall_05` loses, only `dungeon.wall.a` leaves
  its rows, because the arena still uses them.

## `scripts/dungeon/fetch-textures.mjs`

`node scripts/dungeon/fetch-textures.mjs <asset>:<consumer>:<metresPerRepeat> ...`

**For an asset the registry does not hold:**
1. It reads Poly Haven's API for the 1k JPG `Diffuse`, `nor_gl` and `arm` URLs.
2. It downloads them into `public/assets/textures/`.
3. It appends a row for each, with every field the loader requires. The family comes from the
   consumer, `dungeon.floor.a` giving `dungeon-floor`.
4. It appends the source as `CC0-1.0`.

**For an asset the registry already holds,** it adds the consumer to the existing rows, and first
checks the span and each file's sha256.

**It writes `src/textures.json` in the file's hand-written layout.** It refuses to run on a file it
cannot reproduce exactly, so a run adds lines and rewrites none. It refuses a file on disk whose
hash differs from what it would write, and any response that is not a JPEG. It fetches every map
of an asset before it writes any. It is idempotent.

## Materials: `src/dungeon/stone.ts` (new; Node-loadable)

- **`BASE` in `src/materials.ts`** gains `dungeon.floor.a`, `dungeon.floor.b`, `dungeon.wall.a`
  and `dungeon.wall.b`.
  - The fallback colour is session 01's stone in linear light.
  - `roughness` is 1, because the packed map's green channel is multiplied by it.
- **`dungeonStone(scene, floor, wall, textures?)`** builds the two materials, and
  `stoneQuery(location.search)` reads the choice.
  - A textured surface comes from `surface()`, whose maps attach only once decoded.
  - A flat one comes from `flatStone`, session 01's PBR colour, which the doors and the exit use as
    well.
  - It returns each material with its `metresPerRepeat` and whether it is textured.
- **`buildDungeonWorld(scene, map, visuals)`**:
  - `visuals` is `false`, `true` (flat, what Node builds), or a `DungeonSurfaces` from the page, and
    `DungeonRun` passes it through.
  - UVs are metres divided by the surface's span.
  - A textured floor's tiles are 1 m and meet edge to edge. A flat floor keeps 0.98 m tiles, whose
    gaps are its only grid.
  - The colliders are the same in every case.

## Repetition and wear, in the surface plugin (`fog-plugin.ts`)

- **Roles.** `dungeonFog(...).attach(material, role)` takes a role:
  - `"floor"` defines `DUNGEON_STONE`;
  - `"wall"` also defines `DUNGEON_WALL`;
  - `null`, for flat stone and doors, defines neither.
- **The hook.** The code sits at `CUSTOM_FRAGMENT_UPDATE_ALPHA`: after the albedo map is read into
  `surfaceAlbedo`, which is linear, and before any light.
- **`STONE_LOOK`**, set by eye:
  - **Variation:** albedo multiplied by 0.78 to 1.08 by a two-octave value noise of world `xz`, at
    spans of 7 m and 2.3 m, which share no multiple with the maps' spans.
  - **Wall foot:** darkened to 0.55 of the albedo, rising to full over 0.9 m. Patches of near-black
    green grime reach up to 0.6 m at most.
  - **Wall top and coping:** tops at 0.6 of the albedo, and a lit band 1.6 times brighter across the
    top 6 cm of each side face. `WALL_HEIGHT` moved to `fog.ts` so that the shader and the colliders
    read one number.

## Tests

- **`tests/dungeon-stone.test.mjs`:**
  - **`dungeon_textures_are_registered_with_provenance`:**
    - every row's file, not only the dungeon's, hashes to its sha256;
    - every row has a `CC0-1.0` source;
    - each dungeon consumer has exactly one albedo, normal and ORM map;
    - each dungeon surface repeats at 1.5 m or more.
  - **`stone_is_chosen_from_the_query_and_defaults_to_the_owners_choice`.**
  - **`a_textured_world_spans_its_maps_meets_edge_to_edge_and_varies_only_stone`**, under
    `NullEngine` with a texture factory that loads nothing, for three floor/wall pairs:
    - every vertex's UV is its world metres over its surface's span, on all three face
      orientations;
    - tiles are 1 m textured and 0.98 m flat;
    - each plugin's role and defines follow whether its surface is textured;
    - doors follow no stone rule.
- **`the_dungeon_builds_the_same_colliders_with_or_without_visuals`** now also builds with
  textured stone, against the same pinned hashes.

**Mutations, all red:**
- UVs left in raw metres;
- textured tiles keeping their gaps;
- stone rules on a flat floor;
- wall rules on a door;
- the wall define on a floor;
- the query defaulting to `flat`;
- a wall reading the wrong span;
- one flipped byte in a downloaded JPG.

The shader's stone code runs in no test. Only the page check below shows that it compiles.

## Measured

- **The page, in Chrome in a hidden tab, stepped and rendered by hand, `?play=dungeon` (floor `a`,
  wall `a`):**
  - the maps decode and attach;
  - the floor, wall and door effects compile with no error;
  - the floor's carries the stone variation, the wall's the wall rules as well, and the door's
    neither.
- **In a screenshot of that tab,** the room's outer wall faces, which only the cold fill reaches,
  read as a flat blue-grey. Swapping the wall back to session 01's flat basalt at the console gave
  the same blue-grey, and so did turning off the environment and the fill's specular. It is
  session 01's fill light, not this session's stone.
- **`dist/` grows by 6,040,590 bytes,** the nine new JPGs, of which a page loads only the chosen
  floor's and wall's.
- **Open, from review:** whether `tangentBasis: "babylon-lh"` in `surface()` lights an OpenGL map
  inverted on a Babylon-built mesh, which would shade every bump as a pit, here and in the arena.
  It is settled by a rendered raking-light test in its own commit.

## Verification

- `npm test`, `npm run check`, `npm run build`.
- **Owner's checklist:**
  1. `?floor=a` against `?floor=b`, and `?wall=a` against `?wall=b`: which floor, and which wall?
  2. Repetition at the widest zoom (wheel out to 18)?
  3. Do the wall foot, grime, darker tops and lit coping read, or look painted on?
  4. The cost of the maps: the frame counter's `gpu` with `?floor=flat&wall=flat` against the
     default, taken in one window size.
  5. The outer faces of walls, lit only by the cold fill, read blue-grey. The concepts have them
     near-black. Darker?
