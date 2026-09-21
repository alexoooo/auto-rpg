# Next-wave feasibility results — September 21, 2026

Implemented a bounded research laboratory. **No new policy is promoted, and no production rating
is replaced.** These runs establish executable experiments and expose limitations, not a strong
new generation of fighters. The complete compact evidence and six browser-compatible smoke
models are in [results/smoke.json](results/smoke.json).

## What actually ran

All simulation measurements use the real Node/Havok bout harness. No physics, motor limits or
original policy parameters changed. The machine reports 32 logical CPUs, 64 GiB RAM and an
8 GiB RTX 2070 SUPER; these trainers used CPU PyTorch with two Torch threads and one simulator.

| Method / surface | Environment decisions | Training updates | Maximum Python/TypeScript action difference |
| --- | ---: | ---: | ---: |
| PPO / tactical pilot | 4,827 | 148 optimizer epochs | 1.83e-8 |
| NEAT / tactical pilot | 5,200 | 4 complete generations | 3.74e-7 |
| Fixed-topology evolution / pilot | 5,229 | 5 generations | 2.59e-7 |
| PPO / direct Intent | 4,818 | 148 optimizer epochs | 3.07e-8 |
| PPO / residual Intent | 4,381 | 136 optimizer epochs | 1.84e-8 |
| Oracle-label distillation / pilot | No simulator decisions | 1,000 gradient updates | 9.62e-8 |

The five learning runs each had approximately 37 seconds inside the trainer, with an outer
45-second allowance including startup/export. At 12 decisions per simulated second, they collected
about 365–436 seconds of simulation each: roughly 10–12 simulated seconds per trainer wall second,
including model updates and environment resets. This is not pure solver throughput or evidence
that the GPU is the bottleneck. Training episodes were capped at **12 simulated seconds** and used
one training seed per method. These runs must not be used to rank algorithms.

Distillation fitted one selected oracle action. Its low inference/export error validates the
exporter, not imitation quality or generalization. Three additional teacher queries on states
visited by the PPO student were collected; a multi-iteration dataset-aggregation campaign has
not been run.

## Replay and reference AI

- Before/after extraction of the stepping API, Idle, Duelist and Fencer versus Fencer produced
  exactly the same eight-second records. Their combined SHA-256 was
  `034fdd05d54c622eb0943e26fac811e9b0349798c04853b89088a96fdd27fe7c` both times.
- A 73-decision, 6.017-second exploratory trajectory reconstructed exactly from fresh Havok,
  including the command/observation digest, recorded damage and continuation. Collection plus
  verification took 4.049 seconds. A deliberately changed next action changes the trace;
  tampered expected observations fail replay verification.
- The scenario extractor found attack-opportunity, incoming-trajectory and recovery proxies.
  It did **not** find a hand-loss scenario in this short recording. Capability-loss handling is
  separately tested against an edited real publication; that is not a mined replay corpus.
- At one decision point, the privileged two-second oracle evaluated baseline plus four sampled
  alternatives. Its relative-vitality utility improved from **−0.05715 to +0.00645**. This is one
  known opponent/seed and a short horizon, not a win-rate improvement or ground-truth proof.
- Both privileged and fair reference drivers completed two receding-horizon decisions, committing
  0.25 seconds each and reaching 0.583 seconds including the opening prefix. Both saved replay
  checkpoints. Long-fight scalability remains unmeasured.
- The fair teacher used only a public observation-transition ensemble. Its smoke queries reused
  training observations; **held-out model calibration is not established**.

The most important integration finding was action timing: substep-counted deployed decisions
initially disagreed with frame-boundary training decisions. The physical equality test exposed
the difference. Both now schedule on the same simulation clock; complete physical records match
between externally supplied actions and exported policies on pilot, direct and residual surfaces.

## Policies, model refit and evaluation

Seven bespoke prototypes and two original controls completed **144 side-swapped 12-second bouts**,
16 per policy, over selection builds/opponents. Most bouts truncated. Their match scores are
therefore dominated by short-horizon draws and are **not a strength ranking**. Selection entries
also populate an archive using attack cadence, commanded retreat and achieved range occupancy.

The PPO tactical pilot was then evaluated in **24 full-length held-out bouts**, on wheel, multileg,
plated and pitch-blade against Champion, Tactician and Miser, both sides. It scored **4/24 (16.7%)**,
with no time-limit truncations. It is not ready for promotion. There is no matched trained-parent
comparison or multi-seed method comparison here, and this small sample does not establish a
precise underlying win rate.

The old planner's fitting path was restored without replacing its published tables. Two
exploratory bouts supplied **162 exchange windows across 11 state/action cells**. This is a
collection/fit smoke test with sparse coverage, not evidence that refitting improves the planner.
Terminal windows are explicitly excluded because the original table vocabulary has no terminal
state; extending that model is still a research task.

## What should receive the next budget

1. **Longer training episodes and a richer, audited observation set.** The short PPO run is weak;
   do not deploy it or conclude that PPO fails. Compare full-bout learning with a short-exchange
   curriculum, and test any auxiliary reward shaping explicitly against terminal-only rewards.
2. **A broader replay problem set and search-budget curves.** Include natural hand loss and the
   difficult build families. Compare baseline/4/16/64 branches on matched problems before paying
   for long reference fights. Preserve responsive opponent continuation and both information tiers.
3. **Independent model calibration and tactical comparisons.** Measure held-out predictive error,
   cover more state/action cells and test the bespoke policies over full bouts against controls.
   Then expand independent two-hand execution and opponent adaptation where evidence points.
4. **Only then claim learned diversity or robust upgrades.** Use multiple training seeds,
   held-out opponents/builds, paired confidence intervals, adaptive exploiters and browser review.

Total recorded pilot command time, including the earlier development runs, is approximately
**10.25 minutes**, below the agreed one-hour smoke allowance. Dependency installation, code/test
work and browser inspection are not training compute. Further multi-hour campaigns require a new
resource decision rather than consuming the previous experiment's eight-hour authorization.

## Validation and limitations

Tests cover whole-bout/stepping parity, replay divergence and continuation, alternate branches,
all three action surfaces, hand loss, model/feature validation, Python/TypeScript export parity,
observation-only planning, archive restrictions and bridge EOF cleanup. Browser review uses an
isolated experimental page; normal arena policy registration remains unchanged. Remote capture
is approximately 1 fps, so it can verify loading, engagement and damage, not animation smoothness.

Final validation: **624/624 tests passed**, `npm run check` passed and `npm run build` passed.
In the browser, Feinter versus Interceptor engaged and both lost vitality; the exported PPO pilot
loaded, fought Fencer and lost a completed bout without console errors. The bench initialized too.
These observations are qualitative runtime checks, not promotion review or smoothness evidence.

Not completed by these smoke runs: a strong deployed learner, a proven optimal reference,
calibrated fair world-model planning, full-fight oracle superiority, a recorded-pose slow-motion
viewer, an adaptive exploiter population or independent promotion evidence. The APIs and bounded
commands are the implemented first wave; these remaining campaigns are deliberately not labeled
successful merely because the code to start experimenting now exists.
