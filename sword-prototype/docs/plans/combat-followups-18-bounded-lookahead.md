# Session 18 -- execute bounded look-ahead

## Outcome

Produce three full-budget calibrated tactical-model artifacts. The fixed schedule already
covers 13 body/loadout cells, 220 compatible tactic cells per split and handless Centipede
bite/recover behavior.

## Run

~~~powershell
npm run ai:research -- --idea lookahead --seed 310013 --solver-steps 1800000000 --artifact asset-src/learning/research/lookahead-full-310013/champion.artifact --report asset-src/learning/research/lookahead-full-310013/report.json
npm run ai:research -- --idea lookahead --seed 310019 --solver-steps 1800000000 --artifact asset-src/learning/research/lookahead-full-310019/champion.artifact --report asset-src/learning/research/lookahead-full-310019/report.json
npm run ai:research -- --idea lookahead --seed 310031 --solver-steps 1800000000 --artifact asset-src/learning/research/lookahead-full-310031/champion.artifact --report asset-src/learning/research/lookahead-full-310031/report.json
~~~

## Accept

- Every report says 1,800,000,000 consumed and zero unspent solver steps.
- All 13 exact body/loadout cells and every compatible tactic have train and validation
  calibration rows; no failed cell silently borrows another body's model.
- The artifact reloads and its runtime mind refuses each absent or over-threshold cell by
  name.
- Report signed reach error, contact Brier score, vitality-delta error, decisions/second and
  engagement gates per seed in measurements.
- Do not choose the fastest model or inspect test rows; validation error selects the artifact.
