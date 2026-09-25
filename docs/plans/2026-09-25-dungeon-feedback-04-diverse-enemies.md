# Dungeon feedback 04: diverse enemies, skeletons among them

The owner: "enemies should be more diverse, including skeletons too".

## What limits them today

`DungeonRun`'s constructor in `src/dungeon/run.ts` draws every spawn uniformly from the 12 stone builds:

```ts
this.map.spawns.forEach((at, i) => create(`enemy-${i}`, NAMED_BUILDS[Math.floor(random() * NAMED_BUILDS.length)].name, at, "right"));
```

The engine is not what keeps the other families out:
- `create` already resolves any name through `namedBuild`, which searches `PLAYABLE_BUILDS`;
- it gives a body its family's duelist through `FAMILY_POLICY[bodyFamily(setup)]` (`src/golem/family.ts`);
- `tests/skeleton-dungeon.test.mjs` walks a skeleton hero through a level.

What keeps them out is the list, and two sentences that call `NAMED_BUILDS` the dungeon's enemy pool:
- `PLAYABLE_BUILDS`' doc comment in `src/golem/roster.ts`;
- `SKELETON_BUILDS`' doc comment in `src/golem/skeleton/presets.ts`.

`every_playable_build_is_accepted_at_load` in `tests/roster.test.mjs` also asserts
`` `${build.name} is in the enemy pool` `` for any human or skeleton build in `NAMED_BUILDS`.

`NAMED_BUILDS` must not widen. It is the research pool:
- `tests/research.test.mjs`, `tests/research-physical.test.mjs`, `tests/policy-applicability.test.mjs` and
  `tests/random-corner.test.mjs` schedule or sweep over it;
- `research/` stands on it.

## The pool: `src/dungeon/enemies.ts` (new, Node-loadable)

```ts
import { NAMED_BUILDS, type NamedBuild } from "../golem/roster.ts";
import { SKELETON_BUILDS } from "../golem/skeleton/presets.ts";

/**
 * Who a dungeon spawn may be: a family by weight, then a build of it, uniformly. The weights are starting values, to
 * be judged in play. Humans are left out until their cost is measured: each skins about 130,000 vertices on the CPU
 * every frame, hidden or not. `NAMED_BUILDS` is the research pool and is only read here, never widened.
 */
export const DUNGEON_ENEMIES = Object.freeze([
  Object.freeze({ family: "golem", weight: 0.55, builds: NAMED_BUILDS }),
  Object.freeze({ family: "skeleton", weight: 0.45, builds: SKELETON_BUILDS }),
] as const);

/** One enemy's build name, from two draws of `random`. */
export function drawEnemy(random: () => number): string {
  let roll = random() * DUNGEON_ENEMIES.reduce((sum, f) => sum + f.weight, 0);
  const family = DUNGEON_ENEMIES.find(f => (roll -= f.weight) < 0) ?? DUNGEON_ENEMIES[DUNGEON_ENEMIES.length - 1];
  const builds: readonly NamedBuild[] = family.builds;
  return builds[Math.floor(random() * builds.length)].name;
}
```

`run.ts` then reads `create(`enemy-${i}`, drawEnemy(random), at, "right")`, and drops its `NAMED_BUILDS` import.

**Why no humans.** `dressHumanoid` (`src/golem/humanoid/appearance.ts`) adds an `onBeforeRenderObservable` update
that, with `computeBonesUsingShaders = false`, calls `applySkeleton` and `refreshBoundingInfo` on every skin mesh every
frame, fogged or dormant. `warrior.glb` is 129,886 vertices in 42 meshes. The arena holds at most two; a level could
hold several. Adding them is a family row, and it waits for a frame-cost measurement on the owner's machine: a level
with one human against the same level with none, on one seed.

**Themed rooms are not in this session.** An example would be a room's spawns sharing a family. Per-spawn draws are
the simplest version; the owner sees the mix first.

**Correct the two false doc comments**; do not label them:
- `PLAYABLE_BUILDS`: "Only `NAMED_BUILDS` is the dungeon's enemy pool" becomes "`NAMED_BUILDS` is the research pool;
  the dungeon draws its enemies from `DUNGEON_ENEMIES` in `src/dungeon/enemies.ts`, which includes the other
  families".
- `SKELETON_BUILDS`: "A hero and not an enemy: none is in `NAMED_BUILDS`" becomes "none is in `NAMED_BUILDS`, the
  research pool; the dungeon draws them as enemies".
- `roster.ts`'s header ("what an enemy *is*") and `PLAYABLE_BUILDS`' "the enemy pool above": the research pool.
- The header comment of `tests/roster.test.mjs`, which says the same.
- The message in `tests/roster.test.mjs` becomes `` `${build.name} is in the research pool` ``.

## Tests

- **`tests/dungeon-enemies.test.mjs` (new):**
  - `every_dungeon_enemy_is_a_build_the_game_can_stand_up`: every name in every family resolves through
    `namedBuild`, and `bodyFamily(setup)` equals its family's `family`. A mislabelled family goes red.
  - `the_enemy_draw_reaches_every_family_in_its_weights`: 20,000 draws from `mulberry32(1)`. Each family's share is
    within 0.02 of its weight, and every build of every family appears.
  - `the_research_pool_is_not_the_dungeon_pool`: `NAMED_BUILDS` has exactly the 12 names it has today (listed in the
    test), and has no skeleton or human.
  - No human is drawn: every family in `DUNGEON_ENEMIES` is `golem` or `skeleton`, until the frame cost is in.
- **`tests/dungeon-physical.test.mjs`** constructs real runs, and which bodies it fights changes.
  - Read each failure before touching it.
  - Where a test is about a behaviour (acquire, fight, dormancy, a doorway) rather than about which build spawned,
    its fixture may pin its enemies. Add an optional `enemies?: (i: number) => string` to the `DungeonRun`
    constructor's options only if a test needs it; do not weaken a floor to make room.
  - `run.actors.length` stays 9: 8 spawns and the hero.
- **`tests/skeleton-dungeon.test.mjs`, `tests/humanoid.test.mjs` and `tests/dungeon-fog.test.mjs`** also construct
  runs. Each must pass, and each failure must be read.

## Measure before landing

The dungeon's `DORMANCY` and the planner budget were set against stone bodies. Record in "What landed":
- **`scripts/dungeon/sweep.mjs` must not move.** It empties every level's spawns (`map.spawns = []`) and builds the
  hero before any enemy is drawn, so it is this session's null control: plain, `--visuals` and `--classic`, identical
  to the baseline.
- **The fights, in a scratch probe (`.scratch/enemies.mjs`, Node, `createHeadlessArena`, stepped as the sweep
  steps):** generated seeds 1-10 with their spawns, the default hero driven by the sweep's cursor rule, capped at
  120 s. Before and after, per enemy family: how many spawned, how many woke, how many the hero killed, how many
  stood inside rock at the end (`a_footprint_that_starts_inside_the_dungeon_solid_may_leave_it_and_nothing_else`'s
  rule), and the hero's outcome. Look for a seed that stalls or dies where it did not.
- **The replan budget test in `tests/golem-mind.test.mjs`** is load-sensitive; it is not this session's. If it fails
  alone, that is a finding to report, not to tune.

If a skeleton or human enemy never wakes, never fights, or stands in a wall, that is the finding, and it lands before
the weights do.

## Verify

- `npm test`, `npm run check`, `npm run build`.
- **Mutations:**
  - `drawEnemy` always taking family 0;
  - a family's `family` label swapped;
  - `run.ts` back on `NAMED_BUILDS`, which the pool test cannot see, so add
    `a_generated_run_spawns_more_than_one_family`: seeds 1-10, count families over all their spawns, at least 2 each
    of skeleton and golem.

## Owner's checklist

- `?play=dungeon` on a few seeds: skeletons among the golems.
- Do they fight? Does the mix feel right?
- The weights are two numbers in `DUNGEON_ENEMIES`.
- Humans: the owner runs the one-seed frame probe, and decides.

## What landed

(filled in when it lands)
