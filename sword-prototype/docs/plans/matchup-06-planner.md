# Session 06 -- look-ahead, `golem-planner`

**Status (2026-09-05): planned. Needs 05.**

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
