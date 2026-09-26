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

As planned above: `DUNGEON_ENEMIES` in `src/dungeon/enemies.ts`, golems 0.55 and skeletons 0.45, no humans, and
`DungeonRun` spawning `drawEnemy(random)`. `NAMED_BUILDS` is unchanged and pinned by name. The false comments are
corrected: `roster.ts`'s header and `PLAYABLE_BUILDS`, `SKELETON_BUILDS`, `tests/roster.test.mjs`, and the README's
"eight enemy golems" (found by review).

- **The draw takes two numbers an enemy where it took one**, from the same stream as every policy's seed, so every
  golem that still spawns on a seed may be a different build with a different policy seed. That is the whole of the
  change on a seed with no skeleton in it.
- **No test failed, and three were pinned anyway.** `tests/dungeon-physical.test.mjs`, `tests/skeleton-dungeon.test.mjs`,
  `tests/humanoid.test.mjs`, `tests/dungeon-fog.test.mjs` and `tests/dungeon.test.mjs` passed unchanged. But seed 42,
  which most of `dungeon-physical`'s fixtures use, now draws six skeletons and two golems where it drew eight golems,
  so every dormancy test and the force-movement blocker had become skeleton-only without anything going red (found by
  review). `DungeonRun` takes an optional `enemies: (i) => string`, and the tests name what they are about: one stone
  sleeper, a pair of skeleton sleepers, and a stone blocker (0.34 m across, against a skeleton's 0.28). The fight tests
  stay on the draw, which now puts skeletons through them.
- **Sweep, the null control** (`scripts/dungeon/sweep.mjs`, Node headless harness): plain and `--visuals` identical to
  session 05's in outcome and simulated time; `--classic` identical on the 15 rows it shares with session 03's run
  (default 1-10, multileg 1-5).
- **The fights** (`.scratch/enemies.mjs`, Node headless harness, generated seeds 1-10 with their spawns, the default
  hero on the sweep's cursor rule, 120 s cap):

  | | before | after |
  |---|---|---|
  | golems spawned / woke / killed / in rock | 80 / 30 / 2 / 1 | 52 / 29 / 3 / 1 |
  | skeletons spawned / woke / killed / in rock | -- | 28 / 9 / 4 / 0 |
  | hero dead / won / still going at the cap | 7 / 1 / 2 | 9 / 1 / 0 |

  Skeletons wake, fight and die: the 9 that woke landed 389 blows on the hero (43 each; 16 cuts, 28 crushes), against
  2,003 from the 29 golems that woke (69 each). None stood in rock. Fewer skeletons woke because fewer were in the
  hero's way: over the same runs, every enemy that could see the hero within 14 m woke, 29 of 29 golems and 9 of 9
  skeletons, and none woke without (checked by review). So the dead count going from 7 to 9 is not the skeletons. On
  seed 8 no skeleton woke, and seed 10 spawned none: that is the reshuffled stream.
- **Found on the way, not fixed: a hero that stops fighting.** The two seeds "still going at the cap" before were not
  stalls. In both, the hero stands still from about 10 s to the cap beside a golem that is hitting it (on seed 10, 0.7 m
  from a `ram-capped`), with `hero.target` null and its vitality draining (1.00 to 0.80 between 6 s and 24 s; traced by
  review at HEAD). That is the hero's targeting in the probe's facing mode, and it is older than this session. The
  suspect, not verified, is `perceive`'s filter on the cursor's direction, which would drop an enemy in contact behind
  the cursor.
- **Tests** (`tests/dungeon-enemies.test.mjs`): the plan's four, the no-humans rule folded into
  `the_research_pool_is_not_the_dungeon_pool`, and `a_generated_run_spawns_more_than_one_family` building ten real runs
  and reading each enemy's family from its built locomotion module, not from the name drawn.
- **Mutations:** 7, all red (`.scratch/mutate-fb04.mjs`): the draw always taking family 0, the family labels swapped,
  the weights skewed, the last build of a family never drawn, `run.ts` back on `NAMED_BUILDS` (with its import, so the
  test and not `tsc` catches it), humans drawn, and the research pool widened by a skeleton.
- **Humans wait** for the one-seed frame measurement on the owner's machine.
