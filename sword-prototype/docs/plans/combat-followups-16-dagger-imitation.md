# Session 16 -- execute DAgger

## Outcome

Produce three full-budget validation-selected DAgger artifacts. The teacher, strict v3 row
schema, aggregation, worker scheduling, resume and validation selection are implemented.

## Run

~~~powershell
npm run ai:research -- --idea dagger --seed 310013 --workers 8 --solver-steps 1800000000 --run-id dagger-full-310013
npm run ai:research -- --idea dagger --seed 310019 --workers 8 --solver-steps 1800000000 --run-id dagger-full-310019
npm run ai:research -- --idea dagger --seed 310031 --workers 8 --solver-steps 1800000000 --run-id dagger-full-310031
~~~

Resume an interrupted run with --resume and the same run id.

## Accept

- Each report accounts for exactly 1,800,000,000 solver steps.
- Every iteration retains learner-visited state provenance, teacher engagement evidence,
  train/validation separation, macro-F1, attack recall and clone-only comparison.
- The selected iteration is validation-only and its artifact reloads under the frozen
  feature/action contract.
- A small workers-1/workers-8 duplicate remains byte-identical before the full reports land.
- Record wall time, throughput, per-seed validation result and failure cells in
  docs/measurements.md.
