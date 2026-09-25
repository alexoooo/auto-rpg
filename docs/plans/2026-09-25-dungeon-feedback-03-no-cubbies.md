# Dungeon feedback 03: no one-block strips

The owner: "there are a lot of 'pointless' rooms, basically just small cubbies in the wall, which don't really make
sense from a level design standpoint".

## What makes them

The cubbies are not rooms. `layRooms` never makes a room smaller than 2x2 blocks (6x6 cells).

They come from `divide` in `src/dungeon/level.ts`, Diablo's `L5AddWall`:
- It draws one fine-cell wall across a room whose long side is at least `LEVEL.dividerMinBlocks` (3), with
  `LEVEL.dividerChance` (0.6).
- The wall has an arch one block wide.
- Its position is `at = 1 + floor(random * (span - 1))`, on a block boundary.
- `at` = 1 or `span - 1` leaves an edge strip exactly **one block (3 cells) wide** on one side:
  - a 3-block room always splits 3 | 5 cells;
  - a 4-block room splits 3 | 8 two times in three.

Measured over seeds 1-50 (Node, run inline):
- **202 of 244** divided rooms cut a 3-cell strip.
- **41** of those strips are pockets reached only through the arch: 29 of them 3x6, 9 of them 3x9, 3 of them 3x12.
- **60** more have a blind end past the arch.
- In a room 2 blocks wide, the strip beside the arch is a 3x3 bay: the "cubby in the wall".

## The rule

**A dividing wall leaves both sides at least two blocks deep.** Only a room 4 blocks long can be divided, and only at
its middle, which splits it 6 | 5 cells. Two alternatives are rejected:
- **No dividers at all.** This is the simplest, but it drops the Diablo half-room silhouette the owner has not
  complained about.
- **Dividers anywhere but with a wider arch.** This keeps the strip, and the strip is the complaint.

```ts
// LEVEL
  /** A room this many blocks long, or longer, may be divided. At four, the only wall that leaves both sides two
   * blocks deep is the middle one; at three, every wall left a one-block strip, and most such strips were dead-end
   * pockets reached through the arch (seeds 1-50: 202 of 244 walls). */
  dividerMinBlocks: 4,

// divide
    // Two blocks at least on each side: the wall stands on a boundary from the second to the last but one.
    const at = 2 + Math.floor(random() * (span - 3));
```

`line`, `arch` and the `linksHold` undo are unchanged. `roomMax` is 4, so today `at` is always 2. The formula is
written for any span, so raising `roomMax` needs no second edit. A 3-block room now fails the size check before the
chance is drawn, so the stream shifts and every generated level can change.

Measured by review (Node, `level.ts` patched in memory): every divided room on seeds 0-50 splits 6 | 5, 22 of 24
levels on seeds 0-23 still have a wall (the floor is 20), and the walls fall from 120 to 54.

## Tests: `tests/dungeon-level.test.mjs`

- **New: `a_dividing_wall_leaves_no_side_narrower_than_two_blocks`.** Over seeds 0-23:
  - for every room with rock inside its bounds (the walled-room test's own rule), find the wall line;
  - assert that both sides are at least `2 * LEVEL.block - 1` cells deep: 5, the shorter side of a middle split. The
    depth is what the complaint is about: a side 5 deep is a half-room, whatever its exits;
  - mutation: `at = 1 + ...` must turn it red.
- **`walls_cross_the_long_rooms_and_the_count_is_the_walls_that_stand`:** its floor, "at least 20 of the 24 levels
  have a wall", assumed 3-block rooms were eligible.
  - Measure the new count over seeds 0-23 before changing anything, then set the floor from the measurement with the
    figure in a comment, as its own `// 24 on the prototype` does now.
  - If the measured count is below 20, the floor is the thing to change, not the rule: fewer rooms can be divided,
    by design.
- **`a_seed_keeps_the_best_scoring_of_its_candidates`:** its comment names seed 55 as having a tied best score.
  Re-check that the claim still holds, and rewrite or drop the sentence if it does not.
- Every other test in the file is structural and should pass unchanged. If one does not, read why before changing
  it.

## Pins that move, by design

Record each old figure beside its new one in "What landed".

- **`tests/dungeon-dressing.test.mjs`, `the_dungeon_builds_the_same_colliders_with_or_without_visuals`:** the collider
  count and sha256 for seeds 1 and 2. Re-pin from a run, and only after the level tests are green.
- **`tests/dungeon-physical.test.mjs`, `the_hero_explores_generated_levels_to_their_exits`:** the quoted times for
  default seeds 1 and 7 and multileg seed 1. The caps are 120 and 240 s, so check the margins.
- **`tests/dungeon-masonry.test.mjs`, `the_camera_never_sees_into_the_rock`:** fewer walls, fewer faces. It read
  69,558 rays against its `> 70000` floor (measured by review). Re-pin the floor from a run, with the figure.
- **`scripts/dungeon/sweep.mjs`:** the generated rows move. The `--classic` rows use a fixed layout and must not.
  Record both runs.

## Verify

- `npm test`, `npm run check`, `npm run build`.
- **Mutations:**
  - `at = 1 + Math.floor(random() * (span - 1))` restored, which must turn the new test red;
  - `dividerMinBlocks: 3` with the new `at` formula, which must go red or throw (span 3 gives `random() * 0`, so
    `at` = 2, a 5 | 3 split);
  - the `linksHold` undo removed, which existing tests must catch.
- **Re-run the cubby measurement** from the overview (divider strips, blind bays by size, dead-end tips at the widest
  hero's clearance) over seeds 1-50, and write the before and after into "What landed". The 3x3 bays should be gone.
  Name the harness: Node, inline.

## Owner's checklist

- `?play=dungeon` on a few seeds: no 3-cell pockets beside an arch.
- Rooms that are still divided read as two halves.
- If the owner would rather have no dividers at all, it is `dividerChance: 0`, and the walled-room test's floor goes
  with it.

## What landed

(filled in when it lands)
