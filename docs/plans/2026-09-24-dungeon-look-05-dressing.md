# Dungeon look 05: dressing

This session adds the concepts' clutter without giving any of it authority.

What it covers:
- **Flat floor markings:** blood, cracks, moss, puddles, and bone scatter printed flat.
- **Wall-mounted growth:** roots and cobwebs, which name their wall collider under the 04 rule.

Rubble is already part of the 04 wall foot.

## `src/dungeon/dressing.ts`, extended (Node-loadable)

```ts
export type Dressing =
  | { kind: "decal"; decal: "blood" | "crack" | "moss" | "puddle" | "bones"; at: Point; size: number; turn: number; layer: number }
  | { kind: "roots" | "cobweb"; cell: Point; facing: Point; height: number; collider: string };
export function dressingPlacements(map: DungeonMap, seed: number, densities = DRESSING): Dressing[]
```

**Starting densities in `DRESSING`.** The owner judges clutter.
- `decalsPerRoom` 3-6, and corridors 0-1 each.
- `rootsPerLevel` 6.
- `cobwebsPerRoomCorner` 0.35.

**Decals:**
- Decals are flat quads at y = 0.004 + 0.002 x `layer`, so they never z-fight.
- They go on floor cells only, and never within 1.2 m of `map.start`.
- `puddle` has low roughness, to catch the torchlight.
- `bones` is a printed scatter, flat. Standing bones and skulls look solid on the floor, so they
  wait with the barrels (below).

**Roots and cobwebs:**
- Roots and cobwebs are wall-mounted and name the collider of their rock cell.
- They stand at most `KIT.proud` past its face, and never above the collider's 2.8 m top (04's rule).

**Random stream.** Placements are drawn from `mulberry32((seed ^ 0xd2e55) >>> 0)`, a stream of
their own, so no dressing change can move a torch. `torchPlacements` takes no dressing input,
which makes this true by construction. It is stated here, not tested: a test of it would assert
nothing.

## Rendering (`src/dungeon/kit.ts`)

- **Decals:**
  - One mesh per 16x16 chunk.
  - Quads sample `kit-decals.png`, a procedural bake added to `build-kit.py`. If a suitable CC0
    decal exists on Poly Haven's API, record its provenance as in session 03.
  - They are alpha-tested, not blended, and carry the fog plugin.
- **Roots and cobwebs:** thin instances of two small kit pieces, added to `build-kit.py`.

## Validation

`validateDungeonVisuals` gains a dressing branch:
- **Decals:** a quad lies on floor cells, with its top at most 0.02 m high.
- **Mounted pieces:** each names a wall collider, and satisfies the 04 kit rule.

## Tests: `tests/dungeon-dressing.test.mjs`, extended

- **`dressing_is_flat_on_the_floor_or_mounted_on_a_named_wall`** -- seeds 1-50: the validator
  returns nothing.
- **`dressing_keeps_the_start_clean`** -- no decal within 1.2 m of `map.start`.
- **`dressing_is_a_function_of_the_seed`** -- the same seed gives the same result, and different
  seeds differ.
- **`dressing_density_is_what_the_table_asks`** -- with densities passed as twice `DRESSING`, the
  decal count on seeds 1-10 rises by at least 1.6x. This proves the parameter is read.

**Mutations:**
- A decal at y 0.1: red.
- A cobweb 0.3 m proud: red.
- `densities` ignored in favour of `DRESSING`: red, on the density test.

## Verification

- `npm test`, `npm run check`, `npm run build`.
- The sweeps match the baseline.
- **Owner's checklist:**
  1. Clutter: too much, too little, or right? Name the kind that is off.
  2. Do the puddles catch the torchlight?
  3. Does anything look solid that the hero walks through? That would be a defect, not a matter
     of taste.
  4. The probe paste.

## Not in this plan

**Standing props:** barrels, carts, crates, standing bones and skulls, and the portcullis. They
look solid and stand on the floor, so they need cells the level grid owns, and colliders. That is
depths session 06's `Room.piece` territory, or a prop-cell session after it.
