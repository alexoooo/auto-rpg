# Capability filtering and targeted learning — September 22, 2026

Completed: **Golem student (twin blades)** and **Golem residual** are admitted. Fresh
confirmation gains over Duelist were +12.5 and +17.36 percentage points, respectively.
Neither counter qualified. The 7,344-bout rating round completed without failures; all 690
tests, type checking and build pass. Metered local research compute was **4 h 21 m 26 s**
of the eight-hour allowance, with no cloud spending.

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

Preparation, all three student correction rounds, both counter searches and all twelve PPO
training runs completed. The seed audit and exact source snapshot are retained alongside the
protocol. Confirmation and admission outcomes are recorded below as their gates complete.

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
improvement. Archived constant/clock controls scored 37.5 to 58.3%. Additional controls fitted
to the expanded weighted dataset scored 45.8% (constant) and 29.2% (clock). Both passed
NumPy/TypeScript parity; their fresh confirmation results are recorded below. The new corrections
did not improve this selection score.

Against Needle, mixture 13 was selected at 21.9% versus Duelist at 3.1%, each over 32 fresh
selection bouts after a 16-candidate training screen. This is a relative improvement, not
a claim that the challenger usually defeats Needle. The selection gain failed fresh confirmation.

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

## Fresh confirmation

The original twin-blade student scored 80.46875% against Duelist's 67.96875% across 128
bouts per policy, a +12.5 percentage-point gain with paired 95% interval [+3.125, +21.875].
The opponents were Tactician and Miser, excluded from its Champion teacher data. It also
beat every archived constant/clock control with positive lower bounds. The additional
matched-data controls also passed: constant scored 62.109375%, clock scored 62.5%; the
student's gain intervals were [+8.203125, +28.515625] and [+8.59375, +28.125] points,
respectively. The original student passed every predeclared statistical gate.

Neither counter passed its frozen target test. Needle mixture 13 scored 9.375% versus
10.9375% for Duelist: gain -1.5625 points, interval [-10.15625, +7.03125]. Form against
Paired tied Duelist at 3.90625%: interval [-3.90625, +3.90625]. Both used 128 bouts per
policy. Their selection outcomes did not replicate, and neither earns publication.
Whole-pool robustness controls are reported separately, without rescuing a failed target test.

The confirmation job reached its one-hour per-job deadline after completing the student
and both counter categories. Completed side pairs were preserved; the unfinished bout was
excluded. Resumption retains the frozen finalists and charges the same eight-hour allowance.

## PPO selection diagnostics

All twelve trials received 180 trainer seconds, with seeds 11, 22 and 33. Each mean and
sampled export then received 32 full selection bouts. Scores below are in seed order;
they are selection diagnostics, not confidence intervals or independent promotion evidence.

| Variant | Mean export (%) | Sampled export (%) |
| --- | --- | --- |
| Standard residual | 56.25, 71.875, 68.75 | 46.875, 59.375, 53.125 |
| Lower-noise residual | 59.375, 56.25, 53.125 | 67.1875, 59.375, 43.75 |
| Restricted command effects | 46.875, 62.5, 62.5 | 50, 62.5, 56.25 |
| Direct Intent | 18.75, 25, 0 | 28.125, 34.375, 35.9375 |

Duelist scored 46.875% on the same selection fixtures. Standard residual seed 22's mean
export was frozen as the sole PPO finalist. Lower noise and effect masking did not improve
the best selection result; three short trials do not establish either method's ceiling.
Direct Intent performed poorly under this budget. Restricted effects still use a 22-output
likelihood, so this campaign has not tested a genuinely six-dimensional action space.

PPO work exceeded its planned 60-minute allocation once full selection and the required
post-merge replication were included. The shared eight-hour cap remains authoritative;
training-only timing is not substituted for the charged evaluation and replication time.

PPO's frozen standard-residual seed 22 mean export passed fresh confirmation: 70.4861%
versus Duelist's 53.125%, over 144 bouts per policy. The paired gain was +17.3611 points,
with campaign bootstrap interval [+6.25, +27.7778]. All bouts terminated without truncation.
The existing admission checker independently calculates [+6.5972, +28.125] using its own
fixed bootstrap seed; both gates pass. Browser review is recorded in
[wave4-browser-review.json](results/wave4-browser-review.json). The completed shared cross-build rating round is recorded below.

The independent-opponent counter robustness pool also found no qualifying gain. Needle's
selected mixture scored 32.8125%, Form scored 37.5%, and the matched Duelist control scored
36.71875% (128 bouts each). Gain intervals were [-14.0625, +6.25] and [-9.375, +10.9375]
points. These comparisons preserve the whole declared pool rather than selecting a subgroup.

## Shipping-source verification and admission

Published network scopes now feed the same picker applicability interface as bespoke
requirements. A twin-blade model requires two independent, present blade hands with thrust
control. A dual-striker model additionally permits fists. Tests compare the setup and live
assessments with actual network commands, including loss of either hand; the added test was
observed failing before the filter implementation. All 690 tests, type checking and build pass.

This integration changes the source fingerprint, so the original results remain under their
original identity. `research/wave4-publication-replay.mjs` froze all 1,440 student/PPO admission
and control bouts before the edit and replays them on the shipping source, requiring equality
of every recorded field. It uses isolated worker realms, complete side pairs and the same
compute ledger. This is source-equivalence verification, not 1,440 new independent bouts.
A shared rating round admits each candidate only after its own evidence and review pass.

All 1,440 replay bouts matched every recorded field on source
`d185660ab06e6c2b92af2cb4423894fe8dbf2a884d0032397680a6099f7064ca`.
Both admission checks then passed against the actual replay manifests. The shared league
contains 7,344 bouts across the eighteen-policy roster and twelve named bodies. Its ratings
include fallback cases and therefore do not replace the student's scoped confirmation result.

The compact [per-bout evidence](results/wave4-confirmation.json) contains all 2,336 bouts
from eighteen confirmation/control datasets, including the rejected counters and broader
robustness comparison. Its column schema preserves build, opponent, seed and side identity.
Decoding those records reproduces every main confirmation comparison exactly. The separate
[aggregate results](results/wave4.json) include the selection results and all twelve PPO seeds.

The rating runner retains its fixed league seed, 20260922, also used by the preceding
sixteen-policy admission. The expanded eighteen-policy round is rerun in full; unchanged
pairings can reuse earlier seeds. It is a current-roster rating calculation, not 7,344 newly
independent strength trials. The promotion claims come from the separately reserved
confirmation fixtures, whose seed bands and opponents were frozen before evaluation.

## Published result

Both immutable candidates were admitted after the complete shared round. Current provisional
ratings are 1543 for `golem-researched-student-v1`, 1585 for `golem-researched-ppo-v1`, and
1509 for Duelist, each with 816 league bouts. One completed round remains provisional;
it does not replace the scoped, paired confirmation comparisons. The student appears in the
normal picker for compatible twin-blade bodies. The residual policy is available across golem
bodies, with its demonstrated confirmation coverage stated separately.

The full admission record is [admission.json](results/admission.json); Needle's preceding
record is preserved byte-for-byte in [needle-admission.json](results/needle-admission.json).
The campaign used 15,686.379 metered seconds, including interrupted jobs, post-merge replication,
controls, shipping-source replay and the 3,175-second rating league. No extra training was run
to rescue failed counters or to consume the remaining allowance.

The next hypotheses are longer-horizon teacher correction targets, PPO seed reliability and
learning curves, and a true smaller-dimensional action interface. Keep these two admitted
learners frozen as controls; a new experiment needs new declared confirmation fixtures.

Final browser verification used the normal published arena: both current ratings and evidence
scopes displayed, twin-blade selection enabled the student, and a bout between the admitted
policies rendered contacts and damage without error-level console logs. The owned tab and
development server were closed; no listener remained on the verification port.
