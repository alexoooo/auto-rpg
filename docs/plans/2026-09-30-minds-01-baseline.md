# Minds 01: a bout is a recipe, with a trace and a standing table

## Goal

Three instruments the rest of [the set](2026-09-30-minds-00-design.md) is measured with, and no
change to how a bout plays.

1. **A bout is built from plain data** (`DuelRecipe`), with the page's callbacks beside it, so a
   worker thread, a replay and a fork can all rebuild the same bout.
2. **A trace digest**: one number for every segment's pose at every step. Two runs agree to the
   bit or they do not. It gates every later change that should change nothing.
3. **The standing table**: how every matchup ends, at three starting gaps, with a rate of falls.
   Later plans read their effect against it.

On a prototype (Node 24.19, core world, Rapier, 120 Hz, commit `144961d4`) the same bout built
twice gave the same digest, `fd30dd8586076627` over 2271 steps, and eight of the nine matchups
ended by a fall.

## Files

| File | Change |
|---|---|
| `src/arena/duel.ts` | `DuelRecipe`, `DuelHooks`; `new Duel(world, recipe, hooks?)`; `Duel.recipe`; `DuelOptions` goes. |
| `src/arena/main.ts` | The page's callbacks move to the third argument. |
| `tests/harness/trace.mjs` | New. `traceOf`. |
| `research/bout.mjs` | New. `playBout(recipe, seconds)`: one bout in a world of its own, and its row. |
| `research/bout-worker.mjs` | New. One bout per job. |
| `research/bout-trace.mjs` | New. Prints one bout's row. |
| `research/bout-baseline.mjs` | New. Every matchup at each gap; the table. |
| `docs/reference/bouts.md` | New. The table, with its harness. |
| `research/README.md` | Four rows. |
| `tests/arena-core.test.mjs` | Two tests. |

## `src/arena/duel.ts`

`DuelOptions` splits in two. The recipe is everything the bout is, as plain data; the hooks are
what a page hears.

```ts
/**
 * **What a bout is, as plain data**: enough to build the same bout again in another world, on
 * another thread. Nothing here is a function or a live object.
 */
export interface DuelRecipe {
  readonly left: BodyModel;
  readonly right: BodyModel;
  /** How far apart the two stand, m; `GAP_METRES` unless given. */
  readonly gap?: number;
  /** `CAP_SECONDS` unless given. */
  readonly capSeconds?: number;
}

/** What a page hears of a bout. */
export interface DuelHooks {
  /** Hears each blow as it lands. */
  readonly onBlow?: (blow: LandedBlow) => void;
  /** Called with each side as its body is built, before it first steps: the page dresses it. */
  readonly onBuilt?: (duelist: Duelist, built: BuiltBody) => void;
}
```

`Duel`'s constructor becomes `constructor(world: World, recipe: DuelRecipe, hooks: DuelHooks = {})`.
It keeps `readonly recipe: DuelRecipe` (a frozen copy of the argument), reads
`recipe.gap ?? GAP_METRES` and `recipe.capSeconds ?? CAP_SECONDS`, and calls `hooks.onBlow` and
`hooks.onBuilt` where it called `options.onBlow` and `options.onBuilt`. `DuelOptions` is deleted.

The rules are the arena's (`rulebook("arena")`), and `DuelOptions.rules`, which no caller passes,
goes with it: a `Rulebook` is not plain data (a derived `Quantity` carries its rule, a function,
and `structuredClone` refuses it), so it cannot ride in a recipe. An experiment that needs other
rules gives the recipe a named field for the number it changes.

`src/arena/main.ts`: `new Duel(world, { left: matchup.left, right: matchup.right }, { onBuilt, onBlow })`.

## `tests/harness/trace.mjs`

```js
import { createHash } from "node:crypto";

/**
 * A running digest of every segment's pose in `builts`, taken step by step: two runs of one bout
 * agree to the bit or their digests differ. The order is the bodies' as given and each body's
 * segments as built.
 */
export function traceOf(builts) {
  const hash = createHash("sha256"), row = new Float64Array(7), bytes = new Uint8Array(row.buffer);
  return {
    /** Take the bodies as they stand. */
    take() {
      for (const built of builts) for (const segment of built.segments.values()) {
        const p = segment.node.position, q = segment.node.rotationQuaternion;
        row.set([p.x, p.y, p.z, q.x, q.y, q.z, q.w]);
        hash.update(bytes);
      }
    },
    /** The digest of what was taken so far, 16 hex digits. */
    digest: () => hash.copy().digest("hex").slice(0, 16),
  };
}
```

## `research/bout.mjs`

```js
// One arena bout in a world of its own (Node, core world, Rapier, 120 Hz), and its row.
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { addArenaSolids } from "../src/arena/room.ts";
import { Duel, SIDES } from "../src/arena/duel.ts";
import { createWorld } from "../src/core/world.ts";
import { freshEngine } from "../tests/harness/core-stand.mjs";
import { traceOf } from "../tests/harness/trace.mjs";

export const BOUT_HARNESS = "Node, core world (src/core/world.ts), Rapier, 120 Hz";

/** A world with the arena's solids and `recipe`'s bout in it. */
export async function buildBout(recipe) {
  const scene = new Scene(new NullEngine());
  const world = createWorld(scene, await freshEngine());
  addArenaSolids(world.physics);
  const duel = new Duel(world, recipe);
  return { world, duel, dispose() { duel.dispose(); world.dispose(); scene.dispose(); } };
}

/** Play `recipe` to its verdict, or `seconds`: how it ended, what landed, and its trace's digest. */
export async function playBout(recipe, seconds = Infinity) {
  const { world, duel, dispose } = await buildBout(recipe);
  try {
    const trace = traceOf(SIDES.map((side) => duel.duelists[side].built));
    while (!duel.verdict && duel.clock < seconds) { world.step(); trace.take(); }
    const landed = duel.blows.filter((blow) => !blow.clash);
    return {
      recipe, steps: world.steps, seconds: duel.clock,
      winner: duel.verdict?.winner ?? null, ending: duel.verdict?.ending ?? "none",
      blows: landed.length, wounding: landed.filter((blow) => blow.damage > 0).length, clashes: duel.blows.length - landed.length,
      bars: SIDES.map((side) => duel.duelists[side].pool.bar()),
      fallen: SIDES.filter((side) => duel.duelists[side].skills.report.fallen),
      digest: trace.digest(),
    };
  } finally { dispose(); }
}
```

`research/bout-worker.mjs` answers `{ id, recipe, seconds }` with `{ id, result }` or
`{ id, error }`, as `core-strike-worker.mjs` does, and imports `bout.mjs` only.

`research/bout-trace.mjs`: `node research/bout-trace.mjs [left] [right] [seconds]` prints
`JSON.stringify(await playBout({ left, right }, seconds))`. Defaults: `workshop-fighter`,
`workshop-rogue`, 30.

`research/bout-baseline.mjs`: `node research/bout-baseline.mjs [--gaps 3,4,5] [--workers 14]`. Jobs
are every ordered pair of `BODY_MODELS` at each gap (27 by default), fed to a pool of
`bout-worker.mjs` as `core-stance-sweep.mjs` feeds its pool. It prints `BOUT_HARNESS`, one row per
bout (left, right, gap, winner, ending, seconds, blows, wounding, each bar), and the totals: bouts
by ending, **falls per minute of bout time** (fallen sides over the sum of `seconds`, times 60),
wounding blows per minute, and the share of bouts that end before any wounding blow.

## `docs/reference/bouts.md`

The baseline's printed table, under a heading `## Standing table`, with the harness line, the
command, and the commit it was run at written as `<commit>` in a sentence (a record, so it may name
one). Later plans add a section each, never edit this one's numbers: a corrected reference voids
the conclusions drawn from it.

## Tests

In `tests/arena-core.test.mjs`. `playBout` comes from `../research/bout.mjs`.

```js
test("a_bout's_recipe_is_plain_data_that_builds_the_same_bout", async () => {
  const recipe = { left: "workshop-rogue", right: "crypt-skeleton", gap: 3, capSeconds: 1 };
  const { world, dispose } = await arena();
  let duel;
  try {
    duel = new Duel(world, structuredClone(recipe));
    assert.deepEqual(duel.recipe, recipe);
    assert.ok(Object.isFrozen(duel.recipe));
    const { left, right } = duel.duelists;
    assert.deepEqual([left.model, right.model], ["workshop-rogue", "crypt-skeleton"]);
    const apart = right.body.view.stance.centre.x - left.body.view.stance.centre.x;
    assert.ok(Math.abs(apart - 3) < 0.05, `they stand the recipe's gap apart: ${apart}`);
    const verdict = duel.run(2);
    assert.deepEqual([verdict?.ending, verdict?.time], ["time", 1], "and its cap is the recipe's");
  } finally { duel?.dispose(); dispose(); }
});

test("the_same_bout_built_twice_is_the_same_to_the_bit", async () => {
  const recipe = { left: "workshop-fighter", right: "workshop-rogue" };
  // Ten seconds: the two have met, and blows have landed.
  const first = await playBout(recipe, 10), second = await playBout(recipe, 10);
  assert.ok(first.blows + first.clashes > 0, "the fixture reaches contact between the two");
  assert.deepEqual(second, first);
  // The control: a bout that differs differs in its digest.
  const other = await playBout({ ...recipe, gap: 4.001 }, 10);
  assert.notEqual(other.digest, first.digest);
});
```

## Mutations, each must go red

- `Duel` reads `GAP_METRES` and ignores `recipe.gap`: the first test's gap, and the second's control.
- `Duel` ignores `recipe.capSeconds`: the first test's ending.
- `traceOf.take` hashes only positions: no test here goes red, so check it by hand once: turn one
  body's root by 1e-9 rad about up before the first step in a scratch copy of `playBout`; the
  digest must change. (Positions follow rotations within a step or two, so the tests above cannot
  isolate it.)
- `playBout` builds its second bout in the first's world: the second test.

## Verification

```powershell
npm test
npm run check
npm run build
node research/bout-trace.mjs
node research/bout-baseline.mjs --workers 14
```

- `bout-trace.mjs` prints `"steps":2271`, `"ending":"fallen"`, `"digest":"fd30dd8586076627"`: the
  split of the options changed nothing. (The digest is this machine's reading at `144961d4`; on
  another Node or processor, read it before the change and compare after.)
- The baseline's gap-4 rows are the nine of [the design](2026-09-30-minds-00-design.md)'s table.
- Paste the baseline into `docs/reference/bouts.md`.
