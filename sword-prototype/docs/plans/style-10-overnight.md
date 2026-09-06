# Session 10 -- the overnight: learner rounds, the selector refitted, sweeps at scale

**Status (2026-09-06): planned. Needs 08, 09.**

## Outcome

The learner taken as far as a night of the host takes it; the selector refitted with the learner
and the tactician among its candidates; the tactician recalibrated on the learner's exploring
log; and the two reward rows swept. Every run's seed and hours in the entry.

## Frozen choices

- **The overnight is the owner's decision** (2026-09-06): a learning session may run six to ten
  hours of harness unattended, about 100,000 to 200,000 bouts, with the results, seeds and
  artifacts committed the next session.
- **The rounds**: ten of 4,096 bouts, 1,024 of them mirrored self-play, the replay capped at the
  newest 600,000 decisions; about two hours of harness and six of fitting.
- **The sweeps**: `winBonus` {0, 0.25} and `halfLife` {4, 8, 16} as confirmation rows on the
  held-out seed, common random numbers, both pools.
- **The selector refit**: a fresh 24,576-bout random-pairs tournament with the learner and the
  tactician among the candidates, the same script and shrinkage as Session 08.
- **If Session 09 did not clear**, the rounds go first to the two levers the log names: feature
  regions never visited (more explore) and a residual that does not fall (a smaller rate);
  and if neither moves it, this file's status line records the stop under the set's stop rule.

## Implement

1. The overnight run, started by the script's own flags; the log under `tournaments/`.
2. The confirmation rows; the refit; the recalibration.
3. The entry: the round-by-round curve, the sweep table, the refit's cell table, the learned
   against hand-coded reading on both pools with the structural columns.

## Human gate

The learned-versus-hand-coded reading at scale: the owner reads the table and watches the
learner and the selector on three random matchups each. Verdict into this file's status line.

## Verification

```powershell
npm run check
node --test tests/learner.test.mjs tests/selector.test.mjs
npm test
npm run build
git diff --check -- .
```

## What remains

Nothing new is built here; what this session leaves is a number, and Session 11 records it.
