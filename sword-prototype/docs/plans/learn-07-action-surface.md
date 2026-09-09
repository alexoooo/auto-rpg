# Session 07 -- the action surface: is each axis buying what it claims

**Status (2026-09-09): landed.**

## Outcome

A probe that pins one command axis at a time on a viable body and measures what the executor
actually does with it -- the gap a `standOff` holds, whether a saturated `advance` ever brings a
body into strike, what a stroke out of range costs, what `abort` and `parry` are worth, what the
ask rate buys -- and the list of surface changes those measurements earn. The owner asked
whether the low-level options are good for what they are supposed to do; this is the session
that answers with numbers rather than with the record's derivation.

## Frozen choices

- **Measured on the executor, not on the learner.** A pinned axis under `uniform` on every other
  axis, and under `golem-driver` with one axis overridden, on the viable pool from Session 01.
  The learner is not in the loop, because a learner can compensate for a bad axis and hide it.
- **Every claim in the record becomes a row.** The record derives that the feet settle at
  `hold - advance / closeGain`, that a saturated advance buys 0.56 m, that the stroke opens
  inside 0.92 of a reach; each is a predicted number the probe prints beside the measured one.
- **A change to the surface is a version bump and a paired arm, never a silent edit.** A finding
  becomes a candidate; a candidate goes into Session 09's manifest as an arm against the
  unchanged surface; only an arm that clears the bar ships. This session lands the probe, the
  table and the candidates' code behind flags, and moves no shipped constant.
- **Hand-coded minds do not move.** `closeGain`, `strikeFraction` and the rest in
  `../../src/golem/tactics.ts` are the baseline's numbers; a candidate that wants a different
  value gets it through `DrivenTactics` on the learner's executor table only.

## Implement

1. scripts/axis-probe.mjs: a `{pinned: {axis: value}}` contender kind in
   `../../scripts/tournament-worker.mjs` that wraps `uniformPilot` or a named policy and
   overwrites the axis on every ask; `axisProbe({pool, axis, values, base, bouts, workers, seed})`
   running mirrored bouts per value and reporting per value the mean gap over their reach, time
   inside strike, strokes started, blows landed a stroke, damage dealt and taken, stall and
   outside seconds, decided fraction. Grids: `standOff` 0.4 to 2.0 by 0.2; `advance` -1 to +1
   by 0.25 at `standOff` 1.5 and at 1.0; `strafe` likewise; `swing` and `bite` at three values;
   the three gates each forced on and off; `askHz` 6, 12 and 24 through the executor table.
   `--axis`, `--base uniform|golem-driver`, `--bouts 16`, `--seed 20260906`, `--terminals`.
2. The two comparisons the record already names, as rows of the same script: `strokeOutOfRange`
   true against false on the learner's executor table, blows a stroke and damage a bout under
   `uniform`; and `closeGain` 1.8 against 3.6 for the same, whether a saturated advance from 1.5
   reaches 0.9.
3. Candidates, each behind a flag on `GOLEM_TACTICS_V4` or the policy, each with a test, none
   shipped: `holdMetres` -- an absolute stand-off axis in metres beside the reach multiple, so
   the zero of the action space is a distance and not a ratio of someone else's arm;
   `closeGain` for the learner's table raised so a saturated advance crosses from 1.5 to 0.9
   reach; `strokeOutOfRange` false for the learner only; `askHz` 24. A candidate that widens
   `COMMAND_AXES` bumps `POLICY_VERSION` to 3 and keeps 2 loadable, and `../../tests/ppo.test.mjs`'s
   refusal counts move with it.
4. Tests in tests/axis-probe.test.mjs: the pinned contender overwrites exactly the axis named
   and nothing else, seen through the recorded pack; the probe's summary on a fixture of rows;
   `holdMetres` at 1.0 m holds 1.0 m on the bench body to within slack. In
   `../../tests/tactics-v4.test.mjs` (or the file that tests the executor today): the candidate
   flags default off and the byte-identical rerun stands.
5. Run: the full grid on the viable pool, 16 bouts a cell, about 2,000 bouts; the table into
   `../measurements.md` with the predicted column beside the measured one.

## The candidates, as landed and as measured

Written after the run, for Session 09's manifest to draw from. The measurements are in
`../measurements.md` under this session; what follows is the list and the recommendation, so a
reader of the plan set does not have to reconstruct it from a table.

Three flags landed on `GOLEM_TACTICS_V4`, all defaulted to what ships, all spread per cell rather
than assigned, none of them widening `COMMAND_AXES` or touching `POLICY_VERSION`. `holdMetres` is
new with this session; `closeGain` and `strokeOutOfRange` were already rows and needed only the
per-contender executor table the probe added. The fourth, `askHz`, was already a row and needed
nothing.

Recommended, in the order the numbers support:

1. **`standOff` anchored to my own reach rather than theirs.** Not in this plan, and the strongest
   result the probe produced. `standOff` controls the gap over *their* reach to a standard
   deviation of 0.01 and the gap over *mine* to a standard deviation of 0.68 to 1.34, and it is
   mine that `strike` is 0.92 of. Their published reach spans 1.51 to 1.78 m over the viable pool;
   mine spans 0.52 to 1.78 m. One number on this axis means "well inside my range" on a long-armed
   build and "two of my reaches out" on a short-armed one, so a single policy shared across the
   pool cannot express "just inside my own range" at all. A flag on the executor table, the same
   shape as `holdMetres`, no version bump.
2. **`strokeOutOfRange` false.** Against `golem-driver` it throws away 29 % of strokes started and
   buys 41 % more blows a stroke and 29 % more damage dealt; against `idle` it throws away 66 % and
   costs 18 % of damage dealt. The sign depends on the opponent, so it is a paired arm and cannot
   be settled any other way.
3. **`closeGain` lowered, not raised.** Step 3 above asks for it raised so a saturated advance
   crosses from 1.5 reach to 0.9. The fixed point is `gap = hold - advance / closeGain`, so raising
   it makes a saturated advance buy *less* distance: doubling it to 3.6 moved the measured gap out
   from 1.55 m to 1.75 m and dropped time inside strike from 44 % to 29 %. **The plan's direction is
   arithmetically backwards** and the candidate that does what it wanted is 0.9.

Not recommended:

4. **`askHz` 24.** Damage dealt falls monotonically with cadence in both bases -- 29.1, 26.1, 24.1
   under `uniform` and 34.9, 34.2, 31.8 under `golem-driver` for 6, 12 and 24 -- so it costs four
   times the inference to be slightly worse.
5. **`holdMetres`.** It does exactly what its docstring says and what it says is worth 11 % less
   spread in the gap against `idle` and 21 % against a fighting opponent, because the reach
   multiple it removes was only ever varying by 17 %. It stays in the tree behind its flag,
   defaulted off, as the thing candidate 1 is built out of.
6. **`bite` narrowed or dropped.** Three pins across its whole range, two bases, and the largest
   move in damage dealt is 0.5 on 24.

And one finding that is not a surface change: **`uniform` aborts 99.2 % of the strokes it starts**,
so a learner beginning from a uniform prior over the twelve fields almost never observes a finished
stroke. Whatever Session 09's manifest contains, it should not contain a uniform warm-up.

## Human gate

The owner reads the table and picks which candidates go into Session 09's manifest; the
session's own finding is written in advance as a prediction list -- the feet hold within 0.1
reach of `standOff` above 0.8 and not below; a saturated advance never crosses into strike from
1.5; out-of-range strokes are a third of strokes started under `uniform` and land nothing;
`parry` forced on takes less damage than forced off on blade and plate and not on maul -- and
the close-out counts how many held.

## Verification

```powershell
npm run check
node --test tests/axis-probe.test.mjs tests/tournament.test.mjs tests/ppo.test.mjs tests/docs.test.mjs
node scripts/axis-probe.mjs --axis standOff --bouts 4 --workers 8 --random 4
npm test
npm run build
git diff --check -- .
```

## What remains

A new hand-coded mind is written only if a row here shows a thing the surface can do that no
mind does, which is the owner's condition; the default is none. The observation side -- whether
the 71 columns carry what the axes need -- is Session 09's history arm.
