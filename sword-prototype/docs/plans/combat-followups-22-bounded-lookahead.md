# Session 22 -- execute bounded look-ahead

## Outcome

Produce three full-budget calibrated tactical-model artifacts under the session-18
feature-v4/tactic-v2 compute contract. The schedule covers all 13 body/loadout cells and the
exact compatible `(movement, action, effector, target, stance)` count measured by preflight; do not
retain the obsolete 220-cell action-v1 assumption.

## Run

~~~powershell
npm run ai:research -- --idea lookahead --seed 310013 --solver-steps 1800000000 --artifact asset-src/learning/research/lookahead-full-310013/champion.artifact --report asset-src/learning/research/lookahead-full-310013/report.json
npm run ai:research -- --idea lookahead --seed 310019 --solver-steps 1800000000 --artifact asset-src/learning/research/lookahead-full-310019/champion.artifact --report asset-src/learning/research/lookahead-full-310019/report.json
npm run ai:research -- --idea lookahead --seed 310031 --solver-steps 1800000000 --artifact asset-src/learning/research/lookahead-full-310031/champion.artifact --report asset-src/learning/research/lookahead-full-310031/report.json
~~~

## Accept

- Every report says 1,800,000,000 consumed and zero unspent solver steps.
- All 13 exact body/loadout cells and every compatible tactic-v2 tuple have train and validation
  calibration rows; no failed cell silently borrows another body's model.
- The artifact reloads and its runtime mind refuses each absent or over-threshold cell by
  name.
- Report signed reach error, contact Brier score, vitality-delta error, decisions/second and
  engagement gates per seed in measurements.
- Do not choose the fastest model or inspect test rows; validation error selects the artifact.
