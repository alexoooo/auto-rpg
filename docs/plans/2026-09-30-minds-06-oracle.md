# Minds 06: forks by replay, and the oracle

## Goal

Clone a bout at any step and play it out from there under other orders, for research; and on
that, the first oracle: for one side of a bout, how much better it does when at every half second
it tries a handful of responses in forks of the true world and takes the best.

A bout repeats to the bit from its recipe and its tape
(`DuelRecipe`, `Duel.tape`, `Duel.play`), so a fork
needs nothing new in the core: it is a second bout played to the fork's step and on under a
branch of other orders. That costs the whole bout up to the fork each time (1.24 to 1.38 ms a
step: Node, core world, Rapier, 120 Hz), which a 30 s bout affords and a long one does not;
[plan 08](2026-09-30-minds-08-fork.md) swaps the replay for a load behind the same call.

**What the oracle is.** An instrument, not a mind: it holds the true world, which no mind may. It
reports the ceiling of the space it searched and of nothing wider, so every figure of its names
its responses, its period and its horizon. It is clairvoyant: its forks play the opponent's exact
future. `--blind` makes it less so, by nudging each fork and taking the mean.

What it searches is one-step lookahead over the side's own tactics: at each decision, each
response is held for one period, then the side is handed back to its tactics (`seekFoe`) for the
rest of the horizon. So it answers "what is the best of these to do now, if I then fight as I
do". At each decision it does at least as well as its tactics by its own value at the horizon,
since it may choose them; whether its whole bout ends better is what the table reads.

## Files

| File | Change |
|---|---|
| `research/rollouts.mjs` | New: `rollout`, `poseDigest`, `valueOf`, `responsesAt`, `chooseResponse`. |
| `research/rollout-worker.mjs` | New: one rollout per job. |
| `research/oracle.mjs` | New: the oracle's bout beside the tactics' own; the table. |
| `src/arena/matchup.ts`, `src/arena/main.ts` | A bout's tape in a link's fragment (`#tape=`), played by `Duel.play`. |
| `docs/reference/oracle.md` | New: the first table, with its harness and its search. |
| `research/README.md` | A section, "Bouts", with plans 01, 04 and 05's scripts and these. |
| `tests/research-rollouts.test.mjs` | New: four tests. |
| `tests/arena-core.test.mjs` | One test: a tape through a link. |

## `research/rollouts.mjs`

```js
// A bout forked by replay (Node, core world, Rapier, 120 Hz). The same recipe and tape reach the
// same step to the bit, so a fork is the bout played again to that step and on under a branch.
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { SIDES } from "../src/arena/duel.ts";
import { centreOfToRef } from "../src/core/control/support.ts";
import { traceOf } from "../tests/harness/trace.mjs";
import { buildBout } from "./bout.mjs";

const other = (side) => side === "left" ? "right" : "left";

/** The digest of every segment's pose in `builts` as they stand: one instant, not a trace. */
export function poseDigest(builts) {
  const trace = traceOf(builts);
  trace.take();
  return trace.digest();
}

/**
 * `recipe`'s bout under `tape` up to its step `from`, then `steps` more under `branch` (orders
 * entries at `from` or later; the tape's from there on are dropped), or to its verdict. `nudges`
 * are given at the fork: each an impulse, N s, world, at the centre of a side's root.
 * The row: the step reached; the poses' digest at the fork (`at`: two forks of one bout at one
 * step agree in it, or one of them is not that bout), the digest of the trace from the fork on,
 * and the poses' digest at the end; the verdict, each side's bar, who is out, and where each
 * side's centre of mass is. Nothing in it says how the fork was reached.
 */
export async function rollout({ recipe, tape = [], from, branch = [], steps, nudges = [] }) {
  if (branch.some((entry) => entry.step < from)) throw new Error("a branch cannot order the past");
  const { world, duel, dispose } = await buildBout(recipe);
  try {
    const builts = SIDES.map((side) => duel.duelists[side].built);
    duel.play([...tape.filter((entry) => entry.step < from), ...branch]);
    while (!duel.verdict && duel.steps < from) world.step();
    const at = poseDigest(builts);
    for (const { side, impulse } of nudges) {
      const root = duel.duelists[side].body.muscles.dynamics.root.segment;
      root.body.applyImpulse(new Vector3(...impulse), centreOfToRef(root, new Vector3()));
    }
    const trace = traceOf(builts);
    while (!duel.verdict && duel.steps < from + steps) { world.step(); trace.take(); }
    return {
      from, steps: duel.steps, at, digest: trace.digest(), end: poseDigest(builts), verdict: duel.verdict,
      bars: SIDES.map((side) => duel.duelists[side].pool.bar()),
      out: SIDES.filter((side) => !duel.duelists[side].standing),
      centres: SIDES.map((side) => duel.duelists[side].body.view.stance.centre.asArray()),
    };
  } finally { dispose(); }
}

/** What `side` has of a bout as `row` left it: its bar less its foe's, a point more with its foe out, a point less out itself. */
export function valueOf(row, side) {
  const own = SIDES.indexOf(side), foe = SIDES.indexOf(other(side));
  return row.bars[own] - row.bars[foe] + (row.out.includes(other(side)) ? 1 : 0) - (row.out.includes(side) ? 1 : 0);
}

/**
 * The responses `side` may try at this instant of `duel`, in the order ties are broken in: its
 * own tactics first (null), then orders made from where the two stand now. Left and right are the
 * body's own, facing its foe.
 */
export function responsesAt(duel, side) {
  const o = duel.duelists[side].body.view.stance.centre, foe = duel.duelists[other(side)];
  const f = foe.body.view.stance.centre, d = Math.max(0.001, Math.hypot(f.x - o.x, f.z - o.z));
  const toward = { x: (f.x - o.x) / d, z: (f.z - o.z) / d }, right = { x: toward.z, z: -toward.x };
  const head = centreOfToRef(foe.built.segments.get("head"), new Vector3());
  return [
    { name: "own", orders: null },
    { name: "attack", orders: { move: null, face: toward, attack: [head.x, head.y, head.z] } },
    { name: "hold", orders: { move: null, face: toward, attack: null } },
    { name: "close", orders: { move: toward, face: null, attack: null } },
    { name: "back", orders: { move: { x: -toward.x, z: -toward.z }, face: toward, attack: null } },
    { name: "left", orders: { move: { x: -right.x, z: -right.z }, face: toward, attack: null } },
    { name: "right", orders: { move: right, face: toward, attack: null } },
  ];
}

/** The index of the greatest of `values`; the first of equals, so a response must beat the ones before it. */
export function chooseResponse(values) {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i;
  return best;
}
```

`research/rollout-worker.mjs` answers `{ id, ...job }` with `{ id, result: await rollout(job) }`
or `{ id, error }`, as `bout-worker.mjs` does, and imports `rollouts.mjs` only: a worker module
that imports another worker module answers every job twice.

## `research/oracle.mjs`

```
node research/oracle.mjs [--left workshop-fighter] [--right workshop-rogue] [--all] [--gap 4]
  [--side left|right|both] [--every 0.5] [--horizon 2] [--seconds 30] [--blind 0] [--nudge 0.5]
  [--balance left,right] [--workers 14] [--out research/runs/oracle]
```

One oracle bout, for one side of one recipe (`capSeconds` is `--seconds`):

1. **The trunk** is a bout in the main thread (`buildBout(recipe)`), with a trace. It is the true
   world, and the only one that advances for good.
2. **A decision**, every `--every` seconds of the trunk until its verdict: with `from` the
   trunk's step, the candidates are `responsesAt(trunk.duel, side)`. Each is one job, or `--blind`
   jobs: `{ recipe, tape: [...trunk.duel.tape], from, branch, steps: horizon, nudges }`, with
   `branch = [{ step: from, side, orders }, { step: from + every, side, orders: null }]`, or for
   `own`, `[{ step: from, side, orders: null }]`. The jobs go to a pool of `rollout-worker.mjs`
   fed as `core-stance-sweep.mjs` feeds its pool.
3. Every row's `at` must equal the trunk's `poseDigest` at `from`, or the oracle throws: a fork
   that did not reach the trunk's world is not a fork of it.
4. A response's value is the mean of `valueOf(row, side)` over its rows; the choice is
   `chooseResponse`. The trunk is given the choice (`duel.order(side, orders)`) and stepped
   `--every` seconds.
5. **`--blind n`**: each response is played `n` times, each with a nudge on both sides' roots of
   `--nudge` N s in a level direction drawn from `mulberry32` (`src/dungeon/rng.ts`) seeded by
   the decision's step and the trial's index. Every response of a decision meets the same `n`
   nudges, so the comparison is paired. The trunk is not nudged.

It prints `BOUT_HARNESS`, the search (the responses, the period, the horizon, blind or not, each
side's balance) and, for each bout, two rows: the tactics' own bout (`playBout(recipe, seconds)`)
and the oracle's (winner, ending, seconds, each bar, the side's value at the end), then the
decisions taken, the share that left the side's own tactics, the count of each response chosen,
the mean over decisions of the best value less `own`'s (what the search believed it gained), and
the rollouts run with their step count and wall time. With `--out` it writes
`<left>-<right>-<side>.json`, `{ recipe, tape }`, and prints the link that plays it (below).

`--all` runs the nine matchups; with `--side both`, eighteen oracle bouts. A bout's cost by
replay, by arithmetic from the measured 1.3 ms a step and not yet read: a decision at step
`from` runs 7 rollouts of `from + 240` steps, so a 20 s bout (40 decisions) is about 400 000
steps, 9 minutes of one core, and about 80 s on 14 workers, where a decision's seven rollouts run
side by side; a 30 s bout is about twice that. The cost grows with the square of the bout's
length, which is why `--seconds` starts at 30 and why plan 08 replaces the replay. The script
prints what it measured.

## Watching one: a tape in a link

`src/arena/matchup.ts`:

```ts
/** A bout's tape in a link's fragment, which no server is sent: `#tape=<the tape's JSON, URI-encoded>`. */
export const TAPE_KEY = "tape";

/** The tape `hash` carries; none if it carries none, or one that is not an array of entries. */
export function readTape(hash: string): OrdersEntry[] {
  const text = new URLSearchParams(hash.replace(/^#/, "")).get(TAPE_KEY);
  if (!text) return [];
  try {
    const tape: unknown = JSON.parse(text);
    return Array.isArray(tape) && tape.every(isEntry) ? tape : [];
  } catch { return []; }
}

export const tapeHash = (tape: readonly OrdersEntry[]): string => `#${TAPE_KEY}=${encodeURIComponent(JSON.stringify(tape))}`;
```

`isEntry` checks a whole number `step`, a `side` of `SIDES`, and `orders` null or an object.
`src/arena/main.ts`, where it makes a bout: `duel.play(readTape(location.hash))`; a bout with a
tape takes no orders from a person (`you` is ignored, and the clock's cell ends ` · replay`). The
oracle prints `?play=arena&matchup=<left>,<right>&gap=<gap>`, with `&balance=` if the recipe has
one, then `tapeHash(tape)`.

`matchup.ts` gains `GAP_PARAM = "gap"` and `readGap(search): number | undefined` (a finite
number from 1 to 8, else undefined), which `main.ts` puts in the recipe: a tape is of one recipe,
and the link must name all of it.

## Tests

`tests/research-rollouts.test.mjs`. Node, core world, Rapier, 120 Hz. The recipe is
`{ left: "workshop-fighter", right: "workshop-rogue" }`.

1. `a_fork_with_no_branch_is_the_bout`: `rollout({ recipe, from: 0, steps: 720 })` has
   `playBout(recipe, 6)`'s digest and bars (a fork at the start is the bout). And
   `rollout({ recipe, from: 360, steps: 360 })` ends where both end: the same `end`, bars and
   centres as the fork at the start, with another `digest` (its trace began at the fork).
2. `a_fork_leaves_the_bout_at_its_step_and_not_before`: with
   `back = { move: { x: -1, z: 0 }, face: null, attack: null }`,
   `rollout({ recipe, from: 360, branch: [{ step: 360, side: "left", orders: back }], steps: 360 })`:
   its `at` equals the unbranched rollout's `at` (the two were one bout to the fork), its digest
   differs, and its left centre is further back (lesser x) than the unbranched one's by more than
   0.3 m. A tape entry at step 400 is dropped by a fork at 360 (the row is test 1's fork at 360), and a
   branch entry at step 359 throws. A nudge of `[0.5, 0, 0]` on the right side leaves `at` and
   changes the digest; a nudge of zero changes nothing.
3. `the_pool_answers_as_the_call_does`: four jobs through two `rollout-worker.mjs` workers; each
   row deep-equals the same job run inline.
4. `the_oracle's_arithmetic` (no world): `valueOf` on rows written by hand, both sides, each of
   the four outs (`[]`, own, foe, both): `0.5 - 0.25 + 1` and so on, whole numbers checked;
   `chooseResponse([0, 0, 0])` is 0 and `chooseResponse([0, 0.1, 0.1])` is 1 (the first of
   equals); `responsesAt` on a stub of two centres and a head: `own` is first and null, `back`'s
   move is the opposite of `close`'s, `left` and `right` are opposite and level-perpendicular to
   `toward`, and for a body at the origin whose foe is at +z, `right` is +x.

`tests/arena-core.test.mjs`: `a_tape_rides_in_a_link's_fragment`: `readTape(tapeHash(tape))`
deep-equals `tape` for a tape with a null order and an attack point; `readTape("")`,
`readTape("#tape=%7B%7D")` and `readTape("#tape=nonsense")` are `[]`; `readGap("?gap=3.5")` is
3.5, and `readGap("?gap=0")`, `readGap("?gap=x")` and `readGap("")` are undefined.

## Mutations, each must go red

- `rollout` plays the whole tape (does not drop entries from `from` on): test 2's dropped entry.
- It applies its nudges before the first step, not at the fork: test 2 (`at` changes).
- It takes `at` after the fork's first step: test 2's equal `at`s still agree, so the trunk is
  the check: the oracle throws on its first decision. Run `oracle.mjs --seconds 2` once.
- It starts its trace before the replay: test 1 (the fork at 360 has the whole bout's digest).
- `valueOf` reads the sides the wrong way round: test 4.
- `chooseResponse` takes the last of equals (`>=`): test 4.
- `responsesAt` swaps left and right: test 4's last case.
- The worker imports `bout-worker.mjs` beside `rollouts.mjs`: test 3 (rows shift by one).

## Documents

- `docs/reference/oracle.md`: the harness; the search in a sentence (responses, period,
  horizon, clairvoyant or the blind count and nudge, each side's balance); the table; what it
  does and does not show, as below.
- `docs/architecture.md`: a paragraph under "Minds": a bout forks by replay
  (`research/rollouts.mjs`), and the oracle is an instrument outside the core that reads the
  true world.
- `docs/roadmap.md`, "The AI": the oracle's first reading, and the next spaces to search (a
  longer hold, two-step lookahead, strikes chosen by name).
- `research/README.md`: the "Bouts" section.

## Verification

```powershell
npm test
npm run check
npm run build
node research/oracle.mjs --seconds 2 --workers 14               # a smoke: 4 decisions, no throw
node research/oracle.mjs --all --side both --workers 14 --out research/runs/oracle
node research/oracle.mjs --all --side both --blind 4 --workers 14
node research/oracle.mjs --all --side both --balance 5,5 --workers 14   # if plan 05 has landed
```

Into `docs/reference/oracle.md`, read so:

- Each matchup once at one gap is **a count, not a rate**. The claim the table can carry is "of
  18 sides, the oracle did better than the tactics in n, by its own value"; for a rate, run
  `--gap` at several gaps and say how many bouts stand behind it.
- The oracle's value at a decision is never under `own`'s (it may choose `own`); its bout's end
  may still be worse than the tactics' bout, since it looks 2 s ahead. Report how often.
- The clairvoyant and the blind tables side by side: the gap between them is how much of the
  ceiling is knowing the opponent's exact future.
- While bouts end by falls (`docs/reference/bouts.md`), an oracle's gain is mostly "do not fall, and be
  standing when the other does". Read it with plan 05's assisted table beside it before calling
  any of it fencing skill.

**Eye gate: the owner watches one oracle bout** from its printed link, beside the same matchup
with no tape.
