# Dungeon feedback 05: more clutter, more wall decoration

The owner: "i'd add a bit more clutter", and "wall decoration is fine, but i think we just need more of it (higher
density, and more types/diversity)". "The thin shapes look ok": the roots and webs stay as they are.

This session comes after session 02, whose `toward` decides which faces can carry anything. Nothing in it moves a
collider, a route or a fight.

## What "clutter" can be here

The physicality rules of `docs/plans/2026-09-24-dungeon-look-00-overview.md` hold:
- a floor marking is flat;
- a wall piece stands at most `WALL_ALLOWANCE` (0.08 m) off a rock face;
- nothing solid-looking stands on a floor cell.

So clutter here is **flat**: more kinds of floor marking, and more of them. Solid clutter (rubble heaps, barrels,
crates, a cart) needs cells the level grid knows about, with colliders. It belongs with depths session 06's set
pieces, and "What landed" names it as the owner's decision, not built.

## 1. The atlas grows to 4x4: `src/dungeon/decals.ts`

`ATLAS.rows` goes from 2 to 4, and `DECAL_KINDS` from 7 to 16. The existing 7 keep their indices, and so their tiles:

```ts
export const DECAL_KINDS = Object.freeze(["blood", "crack", "moss", "puddle", "bones", "roots", "cobweb",
  "rubble", "scorch", "straw", "grime", "stain", "lichen", "fissure", "chains", "banner"] as const);
```

New `PAINT` entries, each a shape on a clear ground, with the same `Tile` strokes (`plot`, `disc`, `line`, `fill`)
and `noise`/`blob` helpers:

| kind | where | painted as |
|---|---|---|
| `rubble` | floor | 30-50 small angular chips, grey-brown, with a darker underside (a disc offset down and right) so they read as lying on the stone |
| `scorch` | floor | a soot blob with a ragged `noise` edge, darker at the heart; a spent fire |
| `straw` | floor | 60-90 short thin strokes, pale ochre, in a loose drift |
| `grime` | floor | a large low-contrast damp blotch, near-black green; breaks up the floor's repetition |
| `stain` | wall | a water streak: wide at the top, running down in 2-4 fingers that thin and stop |
| `lichen` | wall | the `moss` tile's growth, paler and yellower, in rosettes |
| `fissure` | wall | a branching crack, like `crack` but vertical and thinner |
| `chains` | wall | a ring at the top and two chains of oval links hanging from it; the thin-stroke rule of the cobweb applies |
| `banner` | wall | a tattered cloth, dark red with a faded device, its lower edge torn by `noise` |

**A wall tile is painted in the aspect it is drawn.** A mural's quad is not square (chains are 0.3 by 1.3 m), and a
square tile stretched onto it would stretch its strokes 4 to 1 and void the mip rule, which assumes the tile shrinks
the same both ways (found by review). Each wall kind declares an `aspect` (width over height). Its quad maps only the
tile's centred sub-rectangle of that aspect, the painter paints only inside it, and a quad's `width` is drawn and its
`height` is `width / aspect`.

**The mip rule holds.** Each tile's solid share, at an alpha test of 0.5, keeps at least half at mip 3, and a wall
tile's share is taken over its sub-rectangle. The atlas mip-3 survival assertion in `tests/dungeon-dressing.test.mjs`
measures it. A thin kind (`straw`, `chains`, `fissure`) is thickened until it passes, and its
figures go into "What landed" beside the existing seven.

## 2. Floor clutter: `DRESSING` in `src/dungeon/dressing.ts`

| field | was | now |
|---|---|---|
| `decalsPerRoom` | [3, 6] | [7, 12] |
| `corridorDecalsPerCell` | 0.02 | 0.06 |
| `decals` | blood 0.25, crack 0.25, moss 0.2, puddle 0.15, bones 0.15 | blood 0.14, crack 0.14, moss 0.12, puddle 0.08, bones 0.12, rubble 0.14, scorch 0.06, straw 0.1, grime 0.1 |

Sizes for the new kinds:
- rubble [0.7, 1.3];
- scorch [0.9, 1.6];
- straw [0.8, 1.4];
- grime [1.4, 2.4].

`FLOOR_DECALS` is derived from `DRESSING.decals`, so the placement loop, the layer rule and `validateDressing` take
the new kinds unchanged. `DECAL_LAYERS` is 3. At double the density, check the share of markings dropped for want of a
free layer, over seeds 1-50. If it exceeds 10 %, raise `DECAL_LAYERS` to 4: `decalHeight(3)` is 0.025 m, still flat.
`validateDressing` and `dressing_is_drawn_where_it_was_placed_alpha_tested_fogged_and_owns_no_body` bound a marking's
height at `FLOOR_TOP + 0.02`; move that bound only with a reason.

Every new floor kind goes on the dressing material. The `puddles` material (roughness 0.12) keeps only puddles, so
the test's `4 * puddles.length` count holds.

## 3. Wall pieces: a new `Dressing` variant

Roots hang from a wall's top. The new pieces hang on the face at a height, so they are a variant of their own:

```ts
export type WallPiece = "stain" | "lichen" | "fissure" | "chains" | "banner";

  | { kind: "mural"; piece: WallPiece; cell: Point; facing: Point; along: number; y: number; width: number; height: number }
```

A mural is a quad on the face of rock cell `cell` looking along `facing`, `hungProud` off it:
- centred `along` the face from the cell's middle, and at height `y`;
- `width` by `height`;
- facing the camera, as roots do.

`world.ts`'s `dress` builds murals as a mesh of their own, `dressing.murals.*`, on the dressing material, with the UVs
of the piece's sub-rectangle of `atlasRect(piece)`, row 0 at the top. They stay out of `dressing.hung.*` because
`dressing_is_drawn_where_it_was_placed_alpha_tested_fogged_and_owns_no_body` pins that mesh to the roots: 4 vertices a
root, every vertex on a root, and the roots tile's UVs.

`DRESSING` gains:

```ts
  /** Pieces on the walls the camera sees: a whole number of them for each room, drawn between these. */
  muralsPerRoom: Object.freeze([2, 4] as const),
  /** Each piece's weight, its width in metres, its tile's aspect (width over height, so its height is width / aspect),
   * and the height of its middle. */
  murals: Object.freeze({
    stain:   Object.freeze({ weight: 0.25, width: Object.freeze([0.5, 0.9] as const), aspect: 0.45, y: "top" }),
    lichen:  Object.freeze({ weight: 0.25, width: Object.freeze([0.5, 0.9] as const), aspect: 1, y: Object.freeze([0.6, 1.1] as const) }),
    fissure: Object.freeze({ weight: 0.2,  width: Object.freeze([0.4, 0.7] as const), aspect: 0.45, y: Object.freeze([0.9, 1.6] as const) }),
    chains:  Object.freeze({ weight: 0.15, width: Object.freeze([0.3, 0.45] as const), aspect: 0.3, y: Object.freeze([1.5, 1.9] as const) }),
    banner:  Object.freeze({ weight: 0.15, width: Object.freeze([0.6, 0.85] as const), aspect: 0.55, y: Object.freeze([1.6, 1.9] as const) }),
  }),
```

- `"top"` means the piece hangs from the wall's top, so `y = WALL_HEIGHT - height / 2`.
- Lichen's middle is drawn from [0.6, 1.1], not [0.4, 1.0]: with a height up to 0.9 the lower range reached -0.05 m,
  and 9 % of draws were refused before anything else was checked (found by review).
- Every piece fits between 0.1 m and `WALL_HEIGHT` at every draw: the tallest is a 0.9 m stain at 2.0 m, the lowest
  bottom a fissure's at 0.12 m.
- `rootsPerLevel` goes from 6 to 12. The owner asked for more wall decoration, and the per-level cap is what binds
  today (6 a level at both azimuths, measured by review), so it is the number to move.

**Placement** (in `dressingPlacements`, after the roots, from the same stream):
- For each room, draw a count and try that many times: a random camera-facing, seen face of the room's own boundary
  cells, a random kind, a random size and `y`.
- A face must:
  - face the camera and be `seen`, the roots' test: sample the piece's two ends and middle at its own `y`;
  - not be in a doorway;
  - be clear of every torch's flame by `ROOT_TORCH_CLEARANCE`;
  - be clear of every root and every other mural on the same face, by their widths along it.
- A piece is kept inside its cell's face, as a root is: `|along| + width / 2 <= 0.5`.
  - At 0.85 m a banner fits one cell; a wider piece would span cells and have to prove the next cell's face is rock
    too, which this session does not do.
- Its whole height lies between 0.1 m and `WALL_HEIGHT`.

**`validateDressing`** gains the mural branch: every rule above, as a problem string. The test's refusal cases build
each refused mural by hand, as the roots cases do.

## 4. Tests: `tests/dungeon-dressing.test.mjs`

- `DECAL_KINDS` has 16 entries, and every one has a tile (the atlas test already walks `DECAL_KINDS`).
- **Assertions to extend, not loosen** (found by review):
  - the "every kind is drawn somewhere" list gains the murals;
  - the atlas test lets only roots and cobweb touch a tile's top edge; `stain` hangs from the top and joins them;
  - the per-tile `share < 0.45` bound: measure the banner and grime tiles against it. If a tile is meant to be more
    solid than that, the bound becomes per kind, with each kind's reason.
- The mip-3 survival assertion covers all 16, because it iterates the kinds.
- **The per-room counts:**
  - the existing "at least 3 markings" floor rises to what the new `decalsPerRoom` delivers after refusals. Measure
    it over seeds 1-50 and set the floor a little under the measured minimum, with the figure in a comment;
  - add "at least 1 mural in 70 % of rooms", measured the same way.
- `every_marking_lies_wholly_on_floor` is unchanged; it covers the new floor kinds.
- **`murals_hang_on_faces_the_camera_sees`:**
  - every mural's quad normal, against `frameDungeon`'s camera, is at least 0.3, as the roots check is;
  - a sampled point of every mural passes `seen`.
- **Refusal cases**, one for each mural rule: off the face, in a doorway, at a torch, overlapping, facing away,
  hidden, too high, too low.
- `validateDressing` is clean for seeds 1-50.

## 5. Verify

- `npm test`, `npm run check`, `npm run build`.
- The sweep matches the baseline, plain and `--visuals`.
- **Mutations**, each going red:
  - every refusal rule removed in turn;
  - a mural at `y` 0;
  - `chains` painted with one-pixel strokes, which the mip test must catch;
  - `DECAL_KINDS` with a new kind removed from `PAINT`, which must be a compile error or throw at load;
  - `muralsPerRoom` [0, 0], which the per-room floor must catch.
- **Frame cost:** the dressing is two materials and a handful of merged meshes, so draw calls do not grow with the
  count. Hand the owner the console probe with `?dressing=0` and default on **one seed**, typed into the seed box. The last comparison mixed
  seeds and could not be read.

## 6. Owner's checklist

- `?play=dungeon`, with a seed typed into the start panel's seed box (the page reads no `?seed=`), for a few seeds:
  denser floors, and pieces on the far walls.
- `?dressing=0`, with the same seed typed in, for comparison.
- Every density is a number in `DRESSING`, and every kind a weight.

## What landed

As planned above, with these differences and figures (Node, seeds 1-50, unless named).

- **The aspect lives in `decals.ts`** as `MURAL_ASPECT`, not in `DRESSING.murals`. The painter and the quad both read
  it, and `dressing.ts` already imports `decals.ts`. A piece in the table cannot therefore be drawn at an aspect it was
  not painted in. `muralRect(piece)` is the quad's part of the tile, and a `Tile` built with an aspect clips its
  paint to that strip. A mural carries no `height`: `muralHeight(m)` is its width over its aspect, so the two cannot
  disagree.
- **`HUNG_TOP`** (`WALL_HEIGHT - 0.01`) is the one top that roots, `"top"` pieces and `world.ts` all hang from.
- **A mural reports every reason it is refused**, as roots do (`muralProblems`), except an unknown piece, which has no
  size to check. The overlap rule is in `validateDressing` because it needs the others: a mural may not meet a root or
  another mural on the same wall plane, across cells as well as within one (`wallsMeet`).
- **The new tiles**, share of the solid part (alpha 0.5) over the part the quad shows, and the share kept at the third
  mipmap over the share (`.scratch/atlas05.mjs`):

  | tile | share | mip 3 |
  |---|---|---|
  | rubble | 8.8 % | 0.92 |
  | scorch | 26.7 % | 1.00 |
  | straw | 20.2 % | 1.05 |
  | grime | 27.7 % | 1.01 |
  | stain | 29.1 % | 0.96 |
  | lichen | 12.4 % | 1.02 |
  | fissure | 8.8 % | 0.94 |
  | chains | 25.8 % | 1.05 |
  | banner | 59.4 % | 0.98 |

  The first seven tiles are painted as they were. **The banner has its own bound, under 65 %**: it is cloth and meant
  to read as one solid piece; every other tile stays under 45 %. Stain touches its tile's top, as roots and webs do.
- **Layers:** at the new density, 0.79 % of markings are dropped for want of a free layer, against a copy with no
  limit (`.scratch/layers05.mjs`). `DECAL_LAYERS` stays 3.
- **Counts**, at pi and on the diagonal:

  | | pi | pi/4 |
  |---|---|---|
  | markings a level | 105.5 | 105.5 |
  | fewest markings in a room | 7 | 7 |
  | rooms with a wall piece | 96.7 % | 100 % |
  | wall pieces a level | 26.6 | 29.5 |
  | roots a level | 12 | 12 |
  | webs a level | 3.00 | 1.66 |

  The test's floors are 6 markings a room, a wall piece in 90 % of rooms (not the plan's 70 %: 96.7 % was measured),
  and 22 wall pieces a level, which `muralsPerRoom` [1, 1] fails. The density test doubles the murals on their own:
  that hangs 1.58 times as many (seeds 1-10), as a room's camera-facing walls start to fill, so its floor for murals is
  1.5 where the others' is 1.6. Doubled with the roots, it is 1.39, because the extra roots take the walls first
  (found by review).
- **Tests:** the plan's `murals_hang_on_faces_the_camera_sees` is not a test of its own. The drawn test holds each
  mural's quad to its face, width, height and the camera (normal at least 0.3), and its UVs to `muralRect`, upright and
  unmirrored, twice: against the face's own right-hand side, and through the camera's view matrix, which does not share
  `world.ts`'s idea of which way is right (found by review; each check alone goes red on a mirrored or flipped piece).
  `validateDressing`, clean on every seed at both azimuths, checks each is `seen` at its own height. The
  refusal cases cover every rule, each by one stated edit to a real mural, the hidden case with a seen-before control.
  The atlas test adds that nothing is painted outside a wall tile's strip, and that `muralRect` is that strip.
- **Sweep** (`scripts/dungeon/sweep.mjs`, Node headless harness, default seeds 1-20 and multileg 1-5): identical
  outcomes and simulated times to session 02's, plain and `--visuals`.
- **Mutations:** 25, all red (`.scratch/mutate-fb05.mjs`): each refusal rule removed, the overlap rule dropped and made
  blind to roots, placement blind to roots, murals at `y` 0, `muralsPerRoom` [0, 0] and [1, 1], density read from
  `DRESSING` instead of the table passed, chains in one-pixel strokes, the quad showing the whole tile, paint outside
  the strip, a mural mirrored, wound backwards, drawn square or not drawn, and a kind with no painter (a compile error).
- **Murals are not kept clear of cobwebs**, as roots were not before them: 24 pieces over 50 levels sit behind a web at
  pi, 18 on the diagonal (found by review). A web is drawn in front of what it covers, so it reads as a web over a
  stain or a banner; if the owner sees it as a fault, the clearance is a rule of its own.
- **Not built: solid clutter.** Rubble heaps, barrels, crates and carts need cells with colliders, which is depths
  session 06's set pieces. Whether to build them is the owner's decision.
