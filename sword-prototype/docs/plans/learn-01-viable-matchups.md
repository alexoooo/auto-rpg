# Session 01 -- viable matchups: one predicate, and every pool drawn through it

**Status (2026-09-09): landed.** The mechanical bar is **met**: the 256-bout `--pairs viable`
tournament of `golem-fencer`, `golem-driver` and `golem-policy` at seed 20260906 decided 207 of
256, **80.9 %**, against a bar of 80 % and the record's whole-pool 42.8 %. Met by two bouts, so
it is met and not comfortable. The measurement did not reproduce the plan's placeholder guess:
the second admission rule admitted **every** class through the maul, so `VIABLE_TERMINALS` is the
whole shelf and `VIABLE_PAIRS` -- eleven of twenty-eight -- carries the predicate on its own.
Both tables and what follows from them are in `../measurements.md`. The human gate below is the
owner's and has not been asked.

**Closed out 2026-09-09.** The pools this set runs are *mirrored*, so the pair they are fought on is
`(class, class)` and the class filter was not the predicate governing them. `viableMirror` --
`viablePair` of a body with itself, two classes of the seven -- now filters every pool asked for
mirrored bouts, which cuts the trainer's fifty-two builds to fifteen and lifts the mirrored decided
fraction from 31 % to 88 % at 64 bouts. The cost and both numbers are in `../measurements.md`.

## Outcome

A single answer to "can this pair end a bout" that lives in `../../src/`, is measured rather
than asserted, and is what the trainer, the rating, the idle probe, the league and the screen's
Random button all draw through. After this session no run in the set spends a bout on a layout
that cannot kill, and the owner pressing Random gets a fight that can.

## Frozen choices

- **The class is the unit, not the draw.** `armedTerminal` classes a build by the terminal on the
  hand that fights, which is what `poolFor` in `../../scripts/train-ppo.mjs` already filters on
  and what `../../scripts/idle-probe.mjs` rolls up by. A draw index is a fact about one seed; "a
  maul finishes and a whip does not" is a fact about weapons. The predicate is by class first
  and by class pair second, and never by build name.
- **Measured, with the table beside the constant.** The constant ships with the two tables that
  chose it -- the idle-probe kill rate by class and the random-pairs decided fraction by class
  pair -- and the script that regenerates both. A class enters the viable set when a
  hand-coded mind on it kills a motionless copy of itself in at least half its bouts, or a
  random pair of it against another viable class decides at least half; the second rule is what
  lets a plate fight a maul.
- **The whole pool stays reachable, behind a word.** `--terminals all` is the old behaviour;
  absent, every script defaults to the viable set. The close-out's final tables on the whole pool
  are the reason the flag exists, and they are the only reason.
- **Random redraws rather than restricting the menus.** The owner can still build anything by
  hand, and a hand-built unviable pair is allowed and captioned. Only the draw changes.

## Implement

1. `../../src/golem/viability.ts`: `armedTerminal(setup)` moved here from `../../scripts/tournament.mjs`,
   which re-exports it so no caller changes; `VIABLE_TERMINALS` and `VIABLE_PAIRS` as measured
   constants with their tables in the doc comment; `viableBuild(setup)`; `viablePair(a, b)`;
   `randomViableGolemSetup(rng, tries = 32)` which redraws `randomGolemSetup` from
   `../../src/golem/build.ts` until `viableBuild` and throws past the bound, the way
   `randomGolemSetup` itself throws after eight refusals; `randomViablePair(rng)` for a whole
   matchup. Initial values, to be replaced by the script's output before the session lands:

   ```ts
   export const VIABLE_TERMINALS: readonly string[] = Object.freeze(["maul", "mace", "blade"]);
   /** Class pairs, unordered, that decide at least half their bouts on random pairs. */
   export const VIABLE_PAIRS: ReadonlySet<string> = new Set(["maul|maul", "maul|mace", "maul|blade",
     "mace|mace", "mace|blade", "blade|blade"]);
   export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
   export const viableBuild = (setup: GolemSetup): boolean => VIABLE_TERMINALS.includes(armedTerminal(setup));
   export const viablePair = (a: GolemSetup, b: GolemSetup): boolean =>
     VIABLE_PAIRS.has(pairKey(armedTerminal(a), armedTerminal(b)));
   ```

2. `../../scripts/viability.mjs`: generates both tables. The first is `idleProbe` from
   `../../scripts/idle-probe.mjs` with `golem-driver` over `buildPool({seed, random})`, rolled up
   by `rollupByTerminal`. The second is a `golem-driver` mirror-off tournament -- `scheduleJobs`
   with `mirror: false` and `cross: true` from `../../scripts/tournament.mjs` -- with each row
   classed by `armedTerminal` on both sides and the decided fraction summed per unordered pair.
   Prints both as Markdown and the two constants as a TypeScript literal to paste. Flags
   `--bouts 8 --seed 20260906 --random 40 --workers`, and `--mind` to re-take the table under a
   different reference. A build that no class can decide against is reported by name, so the
   record's thirteen finally get their list.
3. Every pool draws through it. `poolFor` defaults `terminals` to `VIABLE_TERMINALS` and takes
   `all` as the whole pool; `ratePolicy` filters its pool the same way, so a rating and a rollout
   are on the same builds; `../../scripts/rate-snapshots.mjs`, `../../scripts/probe-snapshots.mjs`,
   `../../scripts/idle-probe.mjs` and `../../scripts/league.mjs` take the same default and the same
   word. `--pairs viable` on `../../scripts/tournament.mjs` keeps only pairings `viablePair`
   accepts; the mirrored form uses `viableMirror` (it was written here as `viableBuild`, which the
   close-out corrected: in a mirror the body a build has to be able to finish is itself).
4. The screen. In `../../src/setup.ts` the Random button calls `randomViableGolemSetup`; the
   showcase default matchup in `../../src/bout.ts` is checked viable by a test rather than by
   hand; a hand-built pair that `viablePair` refuses gets one line in the caption, "these two
   cannot finish each other", and Begin stays enabled.
5. Tests. `../../tests/golem-random.test.mjs`: every viable draw is viable and repeats under its
   seed; the bound throws with the class in the message. `../../tests/tournament.test.mjs`: the
   classing test imports from the new module and the re-export is the same function.
   `../../tests/ppo.test.mjs`: the default pool is the viable one, `all` is the whole pool, and a
   class name with a typo is refused by name as `--terminals` is today. `../../tests/bout.test.mjs`:
   the showcase pair is viable.
6. Run: `node scripts/viability.mjs --bouts 8` (about 52 x 8 idle bouts plus 52 x 51 / 2 x 2
   random-pair bouts at 8 a pair, an hour at 30 workers); paste the tables; then the gate's
   tournament below.

## Human gate

The owner presses Random on both sides a dozen times and watches: does every fight look like one
that could end. Verdict into this file's status line. The mechanical bar before that: a 256-bout
`--pairs viable` random-pairs tournament of `golem-fencer`, `golem-driver` and `golem-policy` at
seed 20260906 decides at least 80 % of its bouts, where the record's whole-pool figure is 42.8 %.

## Verification

```powershell
npm run check
node --test tests/golem-random.test.mjs tests/tournament.test.mjs tests/ppo.test.mjs tests/bout.test.mjs tests/docs.test.mjs
node scripts/viability.mjs --bouts 2 --random 4 --workers 4
npm run tournament -- --bouts 256 --pairs viable --random 40 --seed 20260906 --policies golem-fencer,golem-driver,golem-policy
npm test
npm run build
git diff --check -- .
```

## What remains

The pair matrix is by armed terminal only; reach band (`buildClass`) is the next refinement if a
short maul against a long blade turns out to decide nothing, and Session 07's probe will say.
Whether training on viable pairs transfers to the whole pool is Session 12's table.
