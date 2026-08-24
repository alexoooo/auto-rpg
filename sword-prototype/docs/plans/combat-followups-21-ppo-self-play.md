# Session 21 -- execute recurrent PPO

## Outcome

Run both equal-budget PPO initialization arms for each seed against the frozen shipped and
session-20 DAgger league, then retain the validation-selected artifact. PPO trains the
movement/action/effector/target/stance/value heads and all GRU gates with deterministic truncated
BPTT. Every run requires the session-18 compute-contract digest before solver step one.

## League

Pass all three completed DAgger artifacts to every run:

~~~text
--league-artifact asset-src/learning/research/dagger-full-310013/champion.artifact
--league-artifact asset-src/learning/research/dagger-full-310019/champion.artifact
--league-artifact asset-src/learning/research/dagger-full-310031/champion.artifact
~~~

For the second and third seed, also pass earlier frozen PPO champions so the runner retains
the last four available PPO validation champions. Never pass a smoke artifact.

## Run

The runner deliberately refuses --workers greater than 1. Make an arm-boundary checkpoint
first, then continue it; this exercises the same resume path expected after an interruption:

~~~powershell
npm run ai:research -- --idea ppo --seed 310013 --workers 1 --solver-steps 1800000000 --stop-after-jobs 1 --league-artifact asset-src/learning/research/dagger-full-310013/champion.artifact --league-artifact asset-src/learning/research/dagger-full-310019/champion.artifact --league-artifact asset-src/learning/research/dagger-full-310031/champion.artifact --resume asset-src/learning/research/ppo-full-310013/resume.json --report asset-src/learning/research/ppo-full-310013/interrupted-report.json
npm run ai:research -- --idea ppo --seed 310013 --workers 1 --solver-steps 1800000000 --resume-from asset-src/learning/research/ppo-full-310013/resume.json --league-artifact asset-src/learning/research/dagger-full-310013/champion.artifact --league-artifact asset-src/learning/research/dagger-full-310019/champion.artifact --league-artifact asset-src/learning/research/dagger-full-310031/champion.artifact --artifact asset-src/learning/research/ppo-full-310013/champion.artifact --resume asset-src/learning/research/ppo-full-310013/resume.json --report asset-src/learning/research/ppo-full-310013/report.json
~~~

Repeat for seeds 310019 and 310031, changing output directories and adding prior PPO
--league-artifact arguments.

## Accept

- Both arms receive exactly the same solver-step budget; total consumed is 1,800,000,000.
- The report prints every reward component, all five policy-head entropy diagnostics,
  optimizer/clipping diagnostics, recurrent gradient norms, validation macro and worst-cell
  values.
- Validation alone selects the arm. No test row exists.
- Artifact, resume and report reload; a small interrupted/uninterrupted duplicate remains
  byte-identical.
- Record per-seed results, league digests, throughput and failure cells in measurements.
