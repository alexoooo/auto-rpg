# Session 19 -- execute NEAT-QD

## Outcome

Produce three full-budget validation-selected NEAT-QD artifacts plus the three declared
ablation reports under the exact feature-v4/tactic-v2 compute-contract digest frozen by
session 18. The implementation, curriculum, resume path and mutation evidence are complete.

## Run

~~~powershell
npm run ai:research -- --idea neat-qd --seed 310013 --workers 8 --solver-steps 1800000000 --run-id neat-qd-full-310013
npm run ai:research -- --idea neat-qd --seed 310019 --workers 8 --solver-steps 1800000000 --run-id neat-qd-full-310019
npm run ai:research -- --idea neat-qd --seed 310031 --workers 8 --solver-steps 1800000000 --run-id neat-qd-full-310031

npm run ai:research -- --idea neat-qd --seed 310013 --workers 8 --solver-steps 180000000 --ablation without-curriculum --run-id neat-qd-ablation-without-curriculum
npm run ai:research -- --idea neat-qd --seed 310013 --workers 8 --solver-steps 180000000 --ablation without-qd --run-id neat-qd-ablation-without-qd
npm run ai:research -- --idea neat-qd --seed 310013 --workers 8 --solver-steps 180000000 --ablation fixed-species-threshold --run-id neat-qd-ablation-fixed-threshold
~~~

Use --resume with the same run id after an intentional stop. Never copy smoke state into a
full run. Pass the session-18 compute-contract digest through the runner's required contract
argument; the command must refuse a missing or different digest before solver step one.

## Accept

- Every full report says exactly 1,800,000,000 consumed solver steps and every ablation says
  exactly 180,000,000.
- State, report and artifact reload under the frozen feature-v4/tactic-v2 contract and name
  effector/target/stance diversity as well as movement/action diversity.
- Each full report names validation macro, worst-cell, archive coverage, species history and
  the selected champion. Selection is worst-cell first and never reads test.
- Worker-count or completed-checkpoint resume checks reproduce bytes on a small duplicate
  probe before landing the full artifacts.
- Fold run time, throughput, all three results and all ablations into
  docs/measurements.md; do not describe an unsuccessful artifact as a candidate that passed.
