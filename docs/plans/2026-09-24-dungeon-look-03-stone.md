# Dungeon look 03: stone

This session puts dungeon-grade CC0 stone on the floor and walls and hides its repetition. The
owner asked for downloads, and Poly Haven's assets are CC0.

## Candidates

All exist in Poly Haven's API as of 2026-09-24, with `_diff_`, `_nor_gl_` and `_arm_1k.jpg` files.

| Surface | Candidates | Why |
|---|---|---|
| Floor | `cobblestone_floor_06`, `monastery_stone_floor`, `large_floor_tiles_02` | cobbles and flags with dark joints, as in the concepts |
| Walls | `castle_brick_01`, `medieval_blocks_02`, `old_stone_wall` | chunky courses |
| Grime overlay | `mossy_stone_wall` (albedo only) | moss and damp at the foot of the walls |

**Choosing:**
- Look at each candidate's diffuse map, read as an image; my tab cannot render.
- Ship the two best of each, and compare them in play.
- When the owner has chosen, the loser's files, its `src/textures.json` rows **and** its `BASE`
  entry leave in one commit. `buildTexturedSurfaces` throws at module load for a `BASE` consumer
  with no rows, and `materials.ts` is imported nearly everywhere.

## `scripts/dungeon/fetch-textures.mjs` (new)

`node scripts/dungeon/fetch-textures.mjs <asset>:<consumer>:<metresPerRepeat> ...`

1. **Look up the files.** Read `https://api.polyhaven.com/files/<asset>` for the 1k JPG URLs of
   the diffuse, `nor_gl` and `arm` maps. Read them from the API, not from a URL template: the
   registry already holds `*_col_1k.jpg` and `*_albedo_1k.jpg` names.
2. **Download** into `public/assets/textures/`.
3. **Append rows** to `src/textures.json` with every field the loader requires. Copy
   `slab_tiles`' rows as the template:
   - `name`, `file`, `localUrl`, `url`, `sourceUrl`, `sha256`;
   - `channel`, `colourSpace`, `family`, `consumers`, `scale`, `invertY`, `metresPerRepeat`;
   - and, for normal maps, `normalConvention: "opengl"` and `tangentBasis: "babylon-lh"`.
4. **Append the source** with `CC0-1.0`.

The script refuses to overwrite a row whose `sha256` differs, and it is idempotent.

Starting `metresPerRepeat` values, tuned by eye:
- floor 2.0;
- walls 2.4.

## Materials

- **Descriptors.** `BASE` gets `dungeon.floor.a`, `dungeon.floor.b`, `dungeon.wall.a` and
  `dungeon.wall.b`, which replace session 02's pair. `?stone=a|b` (default `a`) chooses the pair.
- **Repetition, in the fog plugin**, with no per-cell UV rotation. A per-cell rotation breaks the
  UV derivatives at every cell edge and shows mip seams. An offset by a whole tile of a wrapping
  texture does nothing.
  - **Low-frequency variation:** a two-octave value noise, 7 m and 2.3 m, of world `xz`
    multiplies the albedo by 0.78-1.08, and its green channel darkens the roughness slightly.
    Repetition at 2 m disappears under a pattern that repeats at no scale the eye locks on to.
  - **Wall foot:** albedo times `mix(0.55, 1.0, smoothstep(0.0, 0.9, y))`, then the
    `mossy_stone_wall` albedo blended in by the same noise, below 0.6 m.
  - **Wall tops:** albedo times 0.6, with a lighter line within 0.06 m of a top edge. That is the
    concepts' lit coping, without geometry; the kit in 04 replaces it.
- **Maps.** `surface()` already configures `nor_gl` as the bump map and `arm` as metallic, reading
  AO, roughness and metal from R, G and B, following the row's fields. Nothing new is needed.

## Tests: `tests/dungeon-stone.test.mjs` (new)

- **`dungeon_textures_are_registered_with_provenance`:**
  - every `dungeon.*` consumer's files exist;
  - each sha256 matches its registry row;
  - each source licence is `CC0-1.0`;
  - `TEXTURED_SURFACES` builds, by importing `src/materials.ts`.
- **`the_dungeon_builds_the_same_colliders_with_or_without_visuals`** passes.

**Mutation:** flip one byte of a downloaded JPG, which turns the test red. Restore it by
re-running the script.

## Verification

- `npm test`, `npm run check`, `npm run build`.
- Name in the commit the size added to `dist/`.
- The sweeps match the baseline.
- **Owner's checklist:**
  1. `?stone=a` against `?stone=b`: which floor, and which wall?
  2. Repetition at the widest zoom (wheel out to 18)?
  3. Do the wall foot and top read, or look painted on?
  4. The probe paste: textures cost memory, not much time.
