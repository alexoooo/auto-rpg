# Session 07 -- the action surface: is each axis buying what it claims

**Status (2026-09-09): planned. Needs 01.**

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
