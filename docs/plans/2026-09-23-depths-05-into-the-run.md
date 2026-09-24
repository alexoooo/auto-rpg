# Session 05: the dungeon plays on the new levels

## Goal

`DungeonRun` builds its map with `generateLevel(seed).map`. The old generator, `generateDungeon`,
leaves `src/`. It becomes a test fixture, so the physical tests that pin its geometry keep testing
the run on the exact layouts they were written against.

Then the owner plays it.

**It needs session 04.** The acceptance test below is exploration on generated levels, and before
session 04 the hero sticks on corridor walls on 19 of 21 classic seeds; on three levels from a
scratch prototype of sessions 02-06 it stuck on all three.

## Files

| File | Change |
|---|---|
| `src/dungeon/run.ts` | The default map is `generateLevel(seed).map`. |
| `src/dungeon/map.ts` | `generateDungeon` is deleted, and `mulberry32`'s import with it. |
| `tests/fixtures/classic-dungeon.mjs` | New. `generateDungeon` moved verbatim, as plain JS. |
| `tests/dungeon.test.mjs` | The generator test goes; the fog test uses the fixture. |
| `tests/dungeon-physical.test.mjs` | Pinned tests use the fixture; one new test on generated levels. |
| `tests/skeleton-dungeon.test.mjs` | Unchanged. It is now a test on a generated level. |
| `tests/humanoid.test.mjs` | Unchanged. Its five dungeon runs are now on a generated level. |
| `README.md` | The dungeon paragraph. |

## `src/dungeon/run.ts`

```ts
import { canSee, cellKey, distance, explorationGoal, findPath, reveal, walkable,
  type DungeonMap, type Point } from "./map.ts";
import { generateLevel } from "./level.ts";
// ...
    this.map = layout ?? generateLevel(seed).map;
```

`generateDungeon` leaves the import. Nothing else in the run changes. It reads `map.start`,
`map.exit`, `map.spawns`, `map.doors` and the floor through `map.ts`'s functions, all of which the
new level fills. `buildDungeonWorld` in `src/dungeon/world.ts` builds a wall box for every run of
`boundary` cells, and a wall across a room is such a run. It needs no change.

The page's Retry calls `launch(seed)` and so gets the same level; New dungeon draws a fresh seed.
Both are unchanged.

## `tests/fixtures/classic-dungeon.mjs`

```js
// The generator the dungeon shipped with until 2026-09: seven rooms on a 3 x 3 lattice, 16 m apart,
// joined by 3 m corridors with a door at each end. It left `src/dungeon/map.ts` when the run moved
// onto `generateLevel` (src/dungeon/level.ts).
//
// Kept only as a fixed layout for tests about the *run* -- traversal, doors, fog, fights, force
// movement -- several of which place bodies at coordinates only this layout has. A change to the
// level generator must never read as a change to the run, so those tests do not use it.
import { mulberry32 } from "../../src/rng.ts";
import { distance, findPath } from "../../src/dungeon/map.ts";

export function classicDungeon(seed) {
  // the body of `generateDungeon`, with its types removed and nothing else changed
}
```

Check it is bit-identical before deleting the original. In the same commit, before the deletion,
add this temporary test, run it, then remove it:

```js
for (let seed = 0; seed < 24; seed++) assert.deepEqual(classicDungeon(seed), generateDungeon(seed));
```

## `tests/dungeon.test.mjs`

- Delete `dungeon seeds produce connected, clear rooms, doors and eight nonoverlapping spawns`.
  Every claim it makes about a generated map is made about the new generator by
  `tests/dungeon-level.test.mjs`, at the widest hero's clearance rather than 0.5 m. Its claim
  about the old generator has no reader once the old generator is a fixture.
- `fog blocks enemy sight through closed doors and exploration uses known frontiers`: replace
  `generateDungeon(42)` with `classicDungeon(42)`. The last assertion walks from (9, 9) to (10, 9),
  which is the classic start room.
- The import line drops `generateDungeon` and gains
  `import { classicDungeon } from "./fixtures/classic-dungeon.mjs";`.

## `tests/dungeon-physical.test.mjs`

Every `generateDungeon(n)` becomes `classicDungeon(n)`. The two tests that build a run with no
layout pass `classicDungeon(42)` explicitly, because each depends on the classic geometry:

- `real dungeon bodies have unique IDs, traverse a doorway and survive teardown/restart` reads
  `run.map.rooms.find(r => distance(r.centre, run.map.start) === 16)`. Its restart half builds a
  second run; give that one `classicDungeon(42)` too.
- `contact resolution wounds an unselected actor and attributes its parry` needs a shield among the
  eight enemies. The enemy builds are drawn from the seed, not the map, but the count is the map's.

Add one test on generated levels. It is the acceptance test for this plan: the hero's own
exploration finds the exit of a new level through its doors, arches and loops.

```js
import { generateLevel } from "../src/dungeon/level.ts";

test("the_hero_explores_generated_levels_to_their_exits", async () => {
  // The default biped on two levels, and the widest body the levels are cleared for on one.
  for (const [seed, build, cap] of [[1, "default", 120], [2, "default", 120], [1, "multileg", 180]]) {
    const arena = await createHeadlessArena({ populateDefaultGeometry: false });
    const map = generateLevel(seed).map; map.spawns = [];
    const run = new DungeonRun(arena.scene, seed, build, false, map);
    try {
      run.commands.setMode({ keyboard: false, facing: true });
      run.commands.cursor = { x: map.exit.x, z: map.exit.z + 30 };
      arena.scene.onBeforePhysicsObservable.add(() => run.step(1 / CONFIG.world.physicsHz));
      for (let i = 0; i < 60 * cap && run.status === "playing"; i++) {
        arena.scene._renderId++; arena.scene._advancePhysicsEngineStep(1000 / 60);
      }
      assert.equal(run.status, "won", JSON.stringify({ seed, build, at: run.hero.body.feetPosition().asArray(),
        exit: map.exit, explored: run.explored.size, doors: map.doors.map((d) => d.open) }));
    } finally { run.dispose(); arena.dispose(); }
  }
});

test("a_run_with_no_layout_plays_the_generated_level_for_its_seed", async () => {
  const arena = await createHeadlessArena({ populateDefaultGeometry: false });
  const run = new DungeonRun(arena.scene, 5, "default", false);
  try { assert.deepEqual(run.map, generateLevel(5).map); }
  finally { run.dispose(); arena.dispose(); }
});
```

`mouse-facing-only exploration reaches the exit using revealed frontiers` does the same on the
classic layouts of seeds 42, 1 and 2 (session 04), and moves onto `classicDungeon(n)` with the
rest. On a scratch prototype of sessions 02-06, with session 04's fix served in place and this
test's body (Node headless harness), the default biped won seeds 1-8 in 40 to 65 simulated
seconds (1.7 to 8 s of wall time), and the multileg won seeds 1-4 in 80 to 105 s (3.6 to 18 s).
The multileg is the body `LEVEL.clearance` is sized for, and the slowest explorer, which is why it
gets the longer cap. The prototype is not the implementation: record the simulated clock at the
win and the wall time for all three runs. If one is near its cap, raise the cap and say so, rather
than pick a seed that happens to be short.

Why `run.map` can be compared with a fresh `generateLevel(5).map` after construction: the run
does not open a door or change the floor before its first `step`.

## `tests/skeleton-dungeon.test.mjs`

Leave it on the default map, which is now a generated level. It strafes 0.5 m from the start room's
centre, a standing cell in a room at least 6 m wide. If it fails, the cause is either the level
(a start centre against a wall) or the body. Find which before touching the fixture choice.

## `tests/humanoid.test.mjs`

Five tests build `new DungeonRun(arena.scene, 42, build, false)` with no layout, so they move from
`generateDungeon(42)` to `generateLevel(42).map`. They test grips, anatomy, parries and the human
skin, and the only thing any of them asks of the floor is that the hero can walk half a metre to
its right from the start (`human maul takes its second grip...`). The start is a room's standing
cell nearest its middle, in a room at least 6 m a side, so that holds on any level. Leave them on
the default map, run the file, and name it in the commit as a file whose floor changed. If one
fails, find whether the level or the body is the cause before passing it `classicDungeon(42)`.

## `README.md`

"explore a generated floor of seven rooms with eight enemy golems" becomes "explore a generated
floor of seven to eleven rooms -- walls with arches across the larger ones, and loops that save the
walk back -- with eight enemy golems".

## Verification

- `npm test`, `npm run check`, `npm run build`. Put the wall time of `tests/dungeon-physical.test.mjs`
  before and after in the commit message.
- Mutations:
  - Point `run.ts` back at the classic generator (import it from the fixture temporarily):
    `a_run_with_no_layout...` goes red.
  - Delete session 04's slide loop in `resolveGroupMoves`: `the_hero_explores_generated_levels...`
    goes red (on the prototype's levels, seeds 1, 2 and 3 all stuck without session 04). This is
    what the test is for: the run navigating the new levels. Whether the levels themselves are
    sound is `tests/dungeon-level.test.mjs`'s business. A level mutation is the wrong probe here:
    the exit is chosen among rooms the start reaches, so a level cut in two still has a reachable
    exit, and the draft's two-cell-arch mutation was invisible to a 0.34 m biped anyway.
- The owner plays on `http://localhost:5180/?play=dungeon` (after session 01; before it,
  `/dungeon.html`). They use their own seeds plus 1, 2 and 3, in all four control modes. What to
  watch:
  1. Do the walls across rooms read as ambushes and cover, or as clutter?
  2. Does a foreground wall hide the hero? `present` in `src/dungeon/world.ts` fades walls in a
     diagonal band in front of the hero. A wall across a room is new ground for that rule.
  3. Do the loops get used? Is the walk back gone?
  4. Doors hang in 0.6 of corridors and never in arches. Is that the right number?
  5. Frame rate against a classic level. There are more wall boxes now, one per run of `boundary`
     cells, capped at four cells long.
  6. Keyboard movement with Facing on, turning while moving: does the hero go where you push? (The
     facing trails the body by about 10 degrees while it turns; session 04's last section.)
  7. Which seeds were good to play, and which dragged? Name a few of each.
- My tab gets no frames (see memory), so all of the above is the owner's. The score's weights are
  set from item 7 and nothing else: for the seeds named, print `--all` and compare the good ones'
  metrics with the dull ones', and move `LEVEL.score` toward what separates them. Bring every
  answer back as a `LEVEL` change with the prints that moved it.

## What landed

As written, with four changes. Figures are from the Node headless harness.

- **The multileg's cap is 240 s, not 120.** On seed 1 it wins at 147.6 s simulated. The exit is in
  the far corner and it tours most of the level at about 1 m/s to find it. Seeds 2-5 take 49.5 to
  155.8 s. The biped wins seeds 1 and 2 at 37.3 and 36.0 s, and seeds 1-20 at 30.6 to 86.2 s.
- **A stall now steps to the middle of the body's own cell.** The review found the biped wedged for
  good on seed 7. Its feet sat on the clearance arc of a rock corner. `clearSegment` samples every
  0.2 m, so it called the straight pull from there clear, but the leg was blocked within a
  millimetre. Every stall replan handed back the same leg.
  - The fix, in the stall branch of `DungeonRun.follow`, routes through the middle of the body's
    cell first. It needs all of these: the replan's first waypoint is the one the body already had;
    the body stands within 0.02 m of rock's clearance; it is more than 0.3 m from the middle of its
    cell; and that middle is walkable.
  - Seed 7 now wins at 63.1 s. Every seed that won before wins at the same time to the hundredth:
    generated biped seeds 1-20, multileg seeds 1-5, and classic seeds 42, 0-10 for both bodies.
  - Seed 7 is in `the_hero_explores_generated_levels_to_their_exits`. Taking the step out turns
    that test red.
  - **The rock-clearance condition came from a second review.** Without it, the step also fired on
    bodies held up by another body, hero and enemies alike. That changed fights on generated seeds
    1-3 with their spawns kept: the hero died at 57.97, 23.35 and 33.88 s, against 62.23, 22.15 and
    19.77 without the step. With the condition, those runs match the ones without the step to the
    hundredth.
  - No test pins the condition, because a fight's outcome is chaotic: removing it leaves the suite
    green.
  - One cost remains. On generated multileg seed 12, the body stands on rock's clearance while
    turning slowly in place, and a plain replan would have freed it. The step detours it, and it
    wins at 114.6 s against 109.1 without the step. Biped seeds 21-60 and multileg seeds 6-11 win
    at the same times either way.
- **`a_run_with_no_layout...` checks seeds 5 and 9**, not one.
- **The exploration test runs biped seeds 1 and 7 and multileg seed 1.** It does not also run biped
  seed 2, because of the wall-clock budget in `the_planner_drives_a_real_bout...` in
  `tests/golem-mind.test.mjs`. That budget reads the load of whatever test files run beside it.
  In the full `npm test` the planner took 3.99 ms a replan with this file on seeds 1, 2 and
  multileg 1, then 5.08 and 5.74 ms with seed 7 added. The budget is 5 ms, and the test alone reads
  0.50. Dropping seed 2 brought the full suite to 3.34 ms. The budget will tip again when any file
  that runs beside it gets heavier.
- **The humanoid and skeleton dungeon tests now run on generated level 42.** They build without a
  layout, as planned, and they pass. `scripts/humanoid/export-*.mjs` do the same and still run.

The review raised three more points. They are left for the owner's play rather than changed:

- **More wall boxes.** A generated level has about 20 % more: a mean of 232 against 194 on a classic
  one. That is item 5 above.
- **Enemies that can see the start.** `spawnFromStart` is 10 m, and classic spawns were never
  closer than 14 m. On 15 of 300 generated seeds, a spawn can see the start at t = 0. Moving the
  spawn distance would reshuffle every level, so it waits for the owner to say whether an early
  fight on those seeds is a problem.
- **Spawns near the exit** are harmless: the run ends when the hero reaches it.
