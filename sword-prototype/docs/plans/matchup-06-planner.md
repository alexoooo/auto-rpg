# Session 06 -- look-ahead, `golem-planner`

**Status (2026-09-06): implemented; the human gate is open.** `src/golem/duel-model.ts`,
`src/golem/duel-model-tables.ts` (generated), `scripts/calibrate-duel-model.mjs` and
`src/golem/planner.ts`, registered as `golem-planner` in `src/golem/golem-policies.ts`,
`src/mind.ts` and `src/units.ts`; six tests in `tests/duel-model.test.mjs`, two in
`tests/golem-mind.test.mjs`, one in `tests/tournament.test.mjs`. Four departures from what is
written below, each recorded in the Session 06 entry of `docs/measurements.md`: the harness
gained an exchange log (`--exchanges`) because a tournament row carries no exchanges to fit
from; the state is four factors, not the plan's nine (the gap rate is the reader's commit, the
bars are weights on the search, the reach pair was dropped for the table's size and is the first
thing owed); the fencer gained a director hook and the planner is a director over it, so the
"executor" is the fencer itself; and the calibration ran three times, each rerun forced by a
defect the planner exposed in the log (a mind following its rules is not an experiment on the
options, so `explore`; a window cut at half a second lost the blow, so an exchange window runs
to its end; the fencer's latch was gating what the director was offered). What it says: 254 and
250.5 of 512 mirrored bouts against the fencer and the duelist, level inside noise, 45 to 29 on
the maul and 50 to 50 on the long blade; 220 and 231.5 of 512 over random pairs, behind both,
because the model carries nothing of the other body but whether it holds a club. A replan is
0.09 ms quiet and under 1.5 ms with the host loaded, against the plan's 5.

## Outcome

A golem mind that chooses its next tactical option by searching a short horizon over a duel model
calibrated from tournament logs, and hands the choice to the fencer's executor to carry out.

## Frozen choices

- **No physics rollouts.** There is no snapshot or restore of a Havok world in this tree, and the
  header of `scripts/measure.mjs` records that allocator and solver history are not part of body
  state and can flip a winner. A restored world would be approximately the world left behind, and
  a planner over an approximation of the wrong kind is worse than a table. The deleted
  look-ahead of 2026-09-04 searched a learned tactical model for the same reason, at 4.28 ms a
  replan.
- **The model is abstract and calibrated, not hand-guessed.** State: gap, gap rate, own phase and
  timer, their estimated phase, both sides' vitality and health, the reach pair, the weapon-kind
  pair. Actions: the options the fencer already executes -- hold, close, withdraw, circle, strike
  now, wait for their recover, feint, ram. Outcome tables (probability of landing, expected damage
  dealt and taken per option given the phase pair and the gap band) are fitted from the tournament
  JSON lines by a calibration script and checked in as a versioned table, refused by version.
- **Depth-limited expectimax, replanned at 4 to 8 Hz, under 5 ms a replan.** About six options
  deep, about a second and a half of horizon. Between replans the executor runs the chosen
  exchange to completion, which is what keeps the planner from changing its mind at 240 Hz.

## Implement

1. The duel model, its tables, and the calibration script over the tournament logs.
2. The planner and its registration as `golem-planner`.
3. Tests: the tables are refused on a version mismatch; on synthetic states the planner waits
   against a committing opponent and strikes into a recovering one; replan cost measured and
   recorded in `docs/measurements.md`.
4. A tournament run against the duelist and the fencer.

## Human gate

The owner watches the planner against the fencer on random matchups. Does it look like it is
waiting for something rather than hesitating. Verdict into this file's status line.

## Verification

```powershell
npm run check
node --test tests/golem-mind.test.mjs
npm run tournament -- --bouts 64 --policies golem-fencer,golem-planner
npm test
npm run build
git diff --check -- .
```
