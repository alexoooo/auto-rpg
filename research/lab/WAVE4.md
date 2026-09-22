# Capability filtering and targeted learning — September 22, 2026

The user approved this campaign after reviewing the implementation plan: eight hours of new
local research compute, no cloud spending, with policy filtering implemented first. The filtering
change is commit `0c73c9b`; browser review covered pitch-only and shared-grip invalidation,
disabled alternatives, and recovery by choosing an applicable policy. All 669 tests, type checking
and the build passed. Owned browser tab and server were closed.

## Frozen protocol

`node research/lab/wave4.mjs <stage> <seconds>` meters each stage against
`research/runs/wave4-budget/budget.json`. Stages are `prepare`, `student`, `counter-needle`,
`counter-paired`, `ppo-standard`, `ppo-low-noise`, `ppo-restricted`, `ppo-direct`, and `confirm`.
Jobs may request at most one hour and stop at the remaining cumulative allowance. Completed
evaluation pairs and training exports are retained for resume. Source changes refuse continuation
under the same protocol. Evidence is in `research/runs/wave4-2026-09-22/`.

- Student: freeze a twin-blade hypothesis from the previous long-fit student; collect three
  rounds across Champion, Planner and Brawler, six distinct teacher queries per trajectory.
  Retain ordinary visited states and weight corrections explicitly. Compare original and
  corrected students with Duelist, constant and four clock-only controls. Tactician and Miser
  remain independent confirmation opponents. Confirmation is 128 bouts per policy, with four
  opposing body types and both sides.
- Counters: compare five original alternatives and ten observation-conditioned mixtures with
  Duelist against each frozen specialist. Train on eight bouts per candidate, select among the
  top three on 32 fresh bouts, then freeze one finalist per target for 128-bout confirmation.
  Challengers use twin blades and fists against the target's twin blades. The last league's
  specialist twin-blade mirror scores were 76.7% (30 bouts each), versus 90.0%/96.7% against
  default bodies. Fist challengers are an exploratory asymmetry, not an established weakness.
  Broader-roster results are reported separately.
- PPO: unchanged residual, lower-noise residual (initial log standard deviation -1.5), and
  restricted aim/reach residual at the same lower noise, plus direct Intent. Each uses seeds
  11/22/33, four isolated environments, 180 trainer seconds per seed, terminal reward and
  150-second full episodes. Both deterministic and sampled exports receive matched selection
  bouts. Report every seed, not only the selected finalist. Direct Intent is a bounded
  multi-seed trial, not a convergence claim. PPO confirmation uses 144 fresh bouts.

The planned workstream ceilings are 30 minutes preparation, 120 minutes students, 90 minutes
counters, 60 minutes PPO diagnostics and 180 minutes confirmation/rating. Unused experimental
time is available for confirmation. The cumulative eight-hour cap remains authoritative.

Promotion requires at least 128 fresh bouts per candidate/control, a gain of at least ten
percentage points, and a strictly positive lower 95% paired bootstrap bound. A student must
also outperform the imitation controls with positive lower bounds. Finalists are frozen before
confirmation. Browser review and a completed new rating league remain required; a failed
subgroup cannot be retrospectively admitted. No outcome is promised.

## Applicability findings

Needle requires a thrust-capable, aimable pointed primary hand with an independent grip.
Pitch-only blades therefore use its Duelist fallback. Paired requires independent present
hands accepting thrust commands; a shield arm accepts that command too. Its compatibility is
broader than its demonstrated dual-blade/fist advantage. Capability filtering must not invent
a narrower strength claim. Historical league scores include fallback cases and are retained.

The new evaluator uses the shared applicability assessor, refuses fallback-only specialist
fixtures by default and records both sides' applicability with every result. An explicit
all-build experiment may allow fallback cases. Published policy implementations, motor limits,
physics and damage rules are unchanged.

## Execution

Preparation completed; the seed audit and exact source snapshot are retained alongside the
protocol. Results will be recorded here after the staged experiments and independent gates.

Before student selection completed, an additional matched-data control check was declared:
`research/wave4-controls.py` fits a constant mean and a 32-tanh-basis clock-only regression to
the expanded dataset, including its explicit retention/query weights. The associated metered
runner evaluates both on the same selection and confirmation fixtures. These controls can
reject an apparent state-dependent student gain; they cannot select another student after
confirmation. Both require NumPy/TypeScript inference parity. Their source snapshots and
data hashes live separately, preserving the already-frozen main campaign source.


## Source update during collection

Main advanced to `790a231` at the user's request. All 686 tests, checking and build
passed. The interrupted student stage retained 41 teacher queries and two trained rounds.
All seven saved trajectories reproduced every recorded state field exactly against the new
source (1,424 decisions); the verification is in `research/runs/merge-790a231-replay.json`.
The old campaign directory remains immutable evidence. Continuation uses
`research/runs/wave4-2026-09-22-r2/`, the same cumulative budget and unchanged hypotheses
and fixtures. Frozen weights and teacher training data transfer with a migration manifest;
verified trajectories retain their original IDs with explicit source lineage. Selection
bouts are rerun on the updated source. No confirmation outcomes had been observed.

## Selection observations (not admission evidence)

The expanded teacher dataset contains 54 queries over nine trajectories and three fitted
rounds: 872 weighted/retention rows, not 872 independent teacher decisions. Search improved
its two-second utility in 47 queries; that did not translate to a better aggregate student. On the 24-bout selection set, the original student scored 75.0%, the corrected
student 66.7%, and Duelist 54.2%. The original was frozen as the student finalist; its
paired gain interval was [0.0, 37.5] percentage points, so selection does not establish
improvement. Archived constant/clock controls scored 37.5?58.3%. Additional controls fitted
to the expanded weighted dataset scored 45.8% (constant) and 29.2% (clock). Both passed
NumPy/TypeScript parity; independent confirmation remains required. The new corrections
did not improve this selection score.

Against Needle, mixture 13 was selected at 21.9% versus Duelist at 3.1%, each over 32 fresh
selection bouts after a 16-candidate training screen. This is a relative improvement, not
a claim that the challenger usually defeats Needle. Confirmation is still pending.

Against Paired, Form and both selected mixtures each scored 9.4%, matching Duelist on
the 32-bout selection set. Form was retained by the predetermined stable ranking; no new
Paired counter emerged. All 192 standard PPO selection bout records reproduced exactly
after the main update, including behavior measures, in addition to the seven trajectory checks.

Before any counter robustness outcome was observed, `research/wave4-counter-controls.mjs
declare` froze a matched Duelist control for the entire predeclared 128-bout robustness pool.
It uses the same cumulative allowance. Its manifest freezes both selected counter hashes,
fixtures and its own source. The subsequent `evaluate` command reports whole-pool gains on
training-held-out opponents separately from target-specific confirmation. This permits an
independent-opponent assessment without weakening the existing learned-policy admission
rule or retrospectively selecting a favorable subgroup.

The restricted PPO variant masks physical effects to six aim/reach channels but retains
the existing 22-output policy and action likelihood. It tests a command-effect restriction,
not a reduced-dimensional optimization problem. A future six-action adapter would be a
different experiment; these results must not be presented as having tested it.
