# Stand-up planning and contact experiments

The owner's goal of substantially faster, robust unassisted recovery is **not achieved**.
The optimized unassisted recipe is a slow, narrow feasibility witness. The additional
`assisted-rise` variant lifts and rights the body with external forces and moments at Balance 100;
its results below are assisted-only evidence, not completion of that goal. Turning off recovery
help produced zero of sixteen twelve-second completions in the recorded ablation. That ablation
still allowed host assistance and is not a fully unassisted evaluation.

The earlier campaign-completion and early-finish claims were incorrect: assistance permission
was treated as permission to substitute a different objective. The work remains incomplete.
See [frozen unassisted comparison](#frozen-unassisted-comparison) for the acceptance repair.

## Harness and reproduction

All figures below use the **Node Stance Lab host**, Warrior (`workshop-fighter`), empty hands,
gameplay `rapier-coordinate`, 120 Hz, symmetric actuation and balance 0. The engine is adapter 11
and the committed `dimforge-rapier3d-simd-compat-0.21.0-auto-rpg.9.tgz`, SHA-256
`0bcb12014c0e982ea2bda99a3d1ab8e263bb81f0d2abcb7d2ade2b578b87b77c`.
The core/Lab source digest is
`b672a9fe1c6ea453a1356bcd9d74efe8679a7d76f1cdc535efa1b80edb2460a3`.
Recovery uses ordinary muscles, with no pose/velocity injection or assist.

`research/stand-up-replay.mjs` runs the actual Lab host through 240 standing steps, a Front
60 N s shove, 24 steps and another Front 60 N s shove. The same body and host persist throughout.
It saves full physics, world, body, skill and order state at distinct transitions, with content
identities and engine/configuration checks. Diagnostic samples are detached and include actual
floor patches, self contacts, applied hand poses, joint limits/efforts, commanded activation,
effort-bound readings, rejected predictions and the complete recovery clocks.

Measured from the second shove, the first down step is 0.475 s, tuck begins at 1.050 s,
prop at 2.492 s, fours at 2.875 s and placement at 3.350 s. Both hands and shins carry actual
load at placement and the trunk is clear. Placement loses support, retries at 4.817 s and
returns to orientation at 6.050 s. Completion count remains **zero after eight seconds**.

Restoring the placement checkpoint into a fresh compatible world gives an identical 60-step
observation trace and controller/world state. The regression also compares the original
uninterrupted continuation and a second fresh checkpoint's continuation. Rapier's internal
serialized storage can differ between an uninterrupted world and a restored one; checkpoint
identity describes the captured contents, rather than equating every world with identical motion.

## Bounded whole-body IK comparison

`research/stand-up-ik.mjs` calculates poses without moving the physical body. It reads the
actual joint conventions, legal ranges, applied hand colliders, complete boots and compound
held shapes. Collision screening excludes adjacent joint-connected pairs and queries admitted
self pairs with native shapes; floor clearance uses the complete shape geometry.

At the actual placement checkpoint, maximum forward-kinematic discrepancy is 0.0000707 m
and 0.000306 rad. Independent point-derivative comparisons with the core's analytic Jacobian
have maximum discrepancy 2.22e-8. Read-only planning leaves checkpoint contents unchanged.
The derivative and geometry regression exercises an obstructed route and a stationary route
that can actually satisfy its tasks; it also checks simultaneous goals for both boots.

The declared target is the production-sized lead step: 0.2 leg lengths sideways and 0.3 ahead
of the captured pelvis, with a flat boot. Both hands and the rear shin retain their measured
material points. Each A–D variant uses the same five seeds and declared iteration budget.
This prototype uses damped least squares and rejects every candidate whose final constraints
fail; its penalties are not a proof that a constrained solution cannot exist.

| Variant, measured seed | Foot position error (m) | Foot rotation error (rad) | Largest penetration (m) | Feasible |
|---|---:|---:|---:|---|
| A: lead limb, fixed pelvis/spine | 0.3042 | 0.4823 | 0.3659 | No |
| B: floating pelvis, fixed spine | 0.0561 | 0.5542 | 0.1308 | No |
| C: floating pelvis and spine | 0.00157 | 0.01086 | 0.1596 | No |
| D: C with collision penalties | 0.1446 | 0.8173 | 0.01087 | No |

C fits the endpoint while the thigh penetrates the upper trunk by about 16 cm. That is an
invalid movement target. D reduces penetration but leaves foot and retained-contact errors;
none of its five seeds passes. E follows a continuous branch and screens interpolated poses.
Its first waypoint passes, but its second fails with 0.0312 m foot error, 0.0652 rad rotation
error and floor violations. No complete collision-screened path is established by this search.

These results identify a conflict in this particular planted-hand placement request. They do
not establish an anatomical or Rapier defect, global infeasibility, or a reason to adopt this
solver in the runtime controller. Whole-body IK remains an optional planning tool.

## Physical boot preparation

`research/stand-up-contact.mjs` retains actual hands and capsule shins through ordinary native
bearing control. It removes the propped-shin boot proxy from this experiment, retains the
captured legal posture and blends knee/ankle goals over 0.5 s. Identical support shares and
control response compare knee targets 1.6, 1.9 and 2.2 rad with ankle targets -0.9, -0.3 and
0.36 rad, clamped to the body's actual ranges. The record hashes the experiment source and
its complete configuration. It measures boot normal load and sole orientation separately.

None of the nine combinations produces both soles facing up under load for the 0.05 s
component gate during the six-second observation. All have zero complete recoveries. For
knee 1.6 and ankle 0.36, the final sampled boots carry 7.37 and 7.48 N, but their sole-up
components are -0.0148 and -0.0169. Boot contact alone would misclassify this preparation.
The regression reaches this physical configuration, verifies bounded muscle efforts and zero
assist, and checks its full observation/controller continuation in a fresh world.

## Reproduction and implications

From the repository root, choose output destinations that do not yet exist:

```powershell
node research/stand-up-replay.mjs --out .review/stand-up-replay
# Use the placement checkpoint listed in replay.json:
node research/stand-up-ik.mjs --checkpoint .review/stand-up-replay/<identity>.checkpoint --out .review/stand-up-ik.json
node research/stand-up-contact.mjs --out .review/stand-up-contact.json
node --test tests/research-stand-up-planning.test.mjs tests/research-stand-up-contact.test.mjs
```

These results reject the tested fixed-contact placement requests, not every recovery route.
Repositioned hands, a side-sitting transition or another contact sequence remain candidates;
none is established as a prerequisite. The half-kneel extension is a separate component witness.
Offline search can reuse these checkpoints and geometry checks while evaluating complete
physical movements with different actions or body configurations. Full timing and robustness
remain pending until uninterrupted fresh-fall recovery, host handover and walking qualify.

## Offline action search

`research/stand-up-environment.mjs` exposes actual muscle commands independently of the recovery
phase machine. Its Node Stance Lab host uses the engine artifact, 120 Hz, symmetric actuation
and balance 0 named above. This experiment's core/Lab source digest is
`74e7e3b183c90dd6f4b5a5419593e831250c6b0be09faed3f1807d9966b5734e`.
Checkpoints include world, physics, host, skills, orders and held
research commands. They reject mismatched source, body and engine identities. Recorded actions
precede their corresponding observations by exactly one world step.

The independent completion predicate requires upright root and soles, loaded foot support,
supported centre of mass, slow motion for half a second, actual host handover, two seconds of
standing and one second of walking with at least 0.1 m displacement. It counts the whole
takeover interval. A slow completion is a feasibility witness, not a passing quick recovery.

For Warrior with empty hands, on the unchanged body, the staged support-recovery baseline
completes the two 60 N s Lab shoves at 90 degrees in 25.275 s from takeover, followed by the
three-second verification tail. Every physical observation replays exactly through the action
port. Original continuation, restored continuation, fresh-world continuation and candidate-order
permutations agree. The Front reproduction does not complete in 50 s with this baseline; Dynamic
rise also fails a twelve-second Front episode in the new environment.

`research/stand-up-search.mjs` records/replays complete demonstrations and searches smooth
bounded target trajectories or retimed command windows with smooth residuals. Command windows
retain their exact physical prefix and evaluate their entire future, including the host tail.
`research/cma.mjs` persists the mean, diagonal covariance, evolution paths, step size, random
state, best candidate and generation; interrupted generations cache completed evaluations.
Workers evaluate sequentially, propagate errors and cancel queued work. All sampled candidates,
prefix construction and winner materialization consume the declared compute budget.

The repaired command pilot evaluates 144 candidates in 216.17 wall-clock seconds across three
workers: 503,922 world steps including materialization, approximately 2,331 steps/s. Other local
checks shared the machine, so this is an observed run rate, not a hardware benchmark. The only
successful candidate is the unchanged replay, with automatic handover one step earlier
(25.2667 s). A fresh-world replay verifies it. Full-tape retiming/residuals at the tested scale
destroy the contact trajectory; they establish no speed improvement. An earlier aborted pilot
revealed command-index rounding at unchanged playback speed. Integer-first indexing and a
full-length regression correct it; those candidate results are excluded.

The first target-trajectory comparisons are invalidated: the adapter subtracted bind angles
from joint limits that are already reference-relative. This incorrectly narrowed some ranges
and extended others. The corrected adapter reads `DofSpec.min/max` directly, as `buildBody`
passes them to the physical joints. Those searches are not evidence about the available action
space, anatomy or relative merits of the two body candidates. Their 2,240,846 computed steps
remain charged to the campaign. New comparisons require corrected inputs and fresh checkpoints.

The corrected comparison uses 1,200 candidates per body, four target knots, the same successful
90-degree baseline as posture guidance, and the Front fall. Neither body completes recovery:
the original takes 1,237,166 counterfactual steps in 483.26 wall-clock seconds; the sole candidate
takes 1,218,924 in 380.26 seconds. Both use three workers and the physical configuration named
above. These are failed smooth-target searches, not evidence of physical impossibility.
The original body's selected failure carries substantial load through the left palm and thigh
while the right thigh contacts the middle trunk. Its left wrist pronation remains about 1.84 rad
from its target at its approximately 6.33 N m directional motor bound. Whole-body posture error
and torso height conceal this blocked contact configuration; a higher surrogate score is not a
recovery.

`research/stand-up-beam.mjs` retains distinct contact/height/orientation prefixes, evaluates
overlapping half-second windows with half-second lookahead, and commits only a quarter second.
Its checkpoints retain ancestry, physical state, optimizer state and a rewind operation. A
one-worker, width-two Front run spends 459,120 world steps and reaches a five-second failed
prefix, still near the floor. The recorded 8,667.31 wall-clock seconds include an unexpected
long execution pause and are unsuitable for throughput comparison. The search stops at its
wall budget. Short-horizon improvement of height/orientation does not supply a complete route.

The existing `withSoles` body is a separate physical candidate, with the same muscle bounds.
Under the staged baseline it completes Front in 29.2917 s but fails the 90-degree recipe in
45 s. These two observations do not establish improved robustness. `research/stand-up-sole.mjs`
checks actual boot dimensions, mass, inertia and the existing sole law on an isolated loaded
boot. At 120 Hz the Warrior's half/full-body loads compress it by 1.18145/2.36291 mm, and the
Rogue's by approximately 0.861/1.722 mm. Both unload to their own-weight compression, remain
within the 6.1 mm layer and show no energy increase during free unloading. Complete physical
and world-state restoration reproduces unloading exactly. This is a material fixture, not a
recovery or whole-leg qualification.

`research/stand-up-design-screen.mjs` separately screens the unchanged support controller on
Front and 90-degree falls for forty seconds each. `research/stand-up-design.mjs` declares strength
factors 1–3, unloaded-speed factors 1–2 and weight factors 0.6–1 through the existing physique
specification, with baseline or compliant-sole contact. Defaults reproduce the original spec
exactly. Every record contains original/candidate mass and all directional muscle envelopes,
actual peak delivered torques and motor bounds. No change is a new shared-body default.

| Warrior, empty hands, unchanged controller | Front | 90 degrees |
|---|---|---|
| Original body | No recovery in 40 s | Verified, 25.275 s |
| Compliant soles | Verified, 29.2917 s | No recovery in 40 s |
| Soles, strength factor 1.5 | No recovery in 40 s | No recovery in 40 s |
| Soles, strength factor 3 | No recovery in 40 s | No recovery in 40 s |
| Soles, unloaded-speed factor 2 | No recovery in 40 s | Handover at 33.1917 s, walking fails |
| Soles, weight factor 0.6 | No recovery in 40 s | No recovery in 40 s |

All twelve trials actually fall. The speed candidate's failed walking tail is a failure, not a
completion. These shared-policy transfer results reject immediate adoption of these settings;
they do not compare separately optimized controllers on every body. The changed weight also
changes geometry through the existing physique system. It is not an isolated mass experiment.

`research/stand-up-native.mjs` evaluates bounded muscle commands in the actual engine to track
the segments of a complete demonstration. Its unchanged-speed reference reproduces the
baseline; counterfactual steps advance neither episode time nor the selected physical path.
Compressing the 25.275 s demonstration to a 20 s target with one optimization iteration per
step fails: no handover after 25 s, 118,692 computed world steps and 537.48 wall-clock seconds.
The one-step tracker loses the reference through changing contacts. This does not establish
that a longer-horizon optimizer or another trajectory cannot succeed.

`research/stand-up-feedback.mjs` searches bounded posture, timing, response and intermediate
transition parameters while retaining the existing contact feedback. It supplies an immutable
recipe to `supportRecovery`; the final standing and walking criteria are not search variables.
The neutral recipe reproduces the baseline physically. Checkpoints identify the complete
physical configuration and search source; interrupted native, trajectory, feedback and beam
work retains a conservative charge for in-flight evaluations.

For the same Warrior/empty/sole Front fall, 600 evaluations and 2,363,058 world steps take
902.07 wall-clock seconds on three workers and find a verified 19.1667 s recovery, compared
with the unchanged controller's 29.2917 s. Its complete action tape replays exactly in a fresh
world. A bounded single-parameter refinement of roll, preparation, subsequent poses, bearing
response and posture response takes 183,308 additional steps and reaches 16.2667 s, including
all attempts before handover and followed by the three-second host tail. This remains far from
the timing target and is evidence for one development fall only.

The feedback experiments use core/Lab source digest
`786a34e6877169fed56b85f0eed219cd014b8808cefc897c2826ca9096342810`, the same vendored engine,
120 Hz, symmetric actuation and zero balance. Recipe changes do not alter the shared presets.
The sole material and body specification are unchanged across this feedback comparison.
The 19.1667 s trace reaches hands-and-knees support at about 8.675 s and begins final
stabilization at 16.35 s. The successful sequence is still predominantly serial. Progress in
one fall does not establish a robust new policy.

A second seeded feedback search evaluates 296 candidates on two workers, using 901,847 world
steps in 907.17 wall-clock seconds. Its best completes the same development fall in 15.5583 s.
A separately charged fresh-fall reconstruction and full action replay verify that result.
This search stops on its wall budget; finishing the in-flight generation accounts for the
7.17 s overrun. No additional candidates are launched afterward.

`research/stand-up-feedback-seed.json` retains the 15.5583 s witness's parameters, physical
identity, configuration and full terminal result as a portable seed. It is not a gameplay
preset. Recording it generates the complete physical action/observation tape from a new fall;
no installed pose or opaque checkpoint is needed to reconstruct it:

```powershell
node research/stand-up-feedback.mjs --mode record --seed research/stand-up-feedback-seed.json --output .review/stand-up/feedback-witness.trace --seconds 35
node research/stand-up-search.mjs replay --input .review/stand-up/feedback-witness.trace
```

A matched development transfer screen uses the sole body, the four cardinal two-shove recipes,
Warrior/Rogue and empty hands/right-hand club, with a 35 s episode cap including the host tail.
All sixteen cases per controller actually fall. These are development comparisons, not the
64-direction final qualification; zero cases satisfy the six-second deadline.

| Controller on the same sole bodies | Warrior, empty | Warrior, club | Rogue, empty | Rogue, club |
|---|---|---|---|---|
| Unchanged support recovery | 2/4: Front 29.2917 s; 180 degrees 30.925 s | 0/4 | 0/4 | 0/4 |
| 16.2667 s refinement | 1/4: Front 16.2667 s | 0/4 | 0/4 | 0/4 |
| 15.5583 s final seed | 1/4: Front 15.5583 s | 0/4 | 0/4 | 0/4 |

The baseline/earlier-seed screen consumes 142,043 world steps in 348.59 wall-clock seconds;
the separate final-seed screen consumes 70,220 in 179.13 seconds, one worker each while other
experiments share the machine. Records retain all failures and complete physical identities.
The first screen captured the earlier seed while the final seed was being reconstructed; its
candidate is identified by recipe digest and is not mislabeled as the final result. The final
screen uses a fixed copy of the final seed. The club is the existing statically retained item
on the hand's compound rigid body, with its actual collision geometry and mass.

The faster Front result therefore fails the robustness objective and loses a completion the
unchanged controller retains. It is unsuitable for promotion. It shows that the search can
find a faster complete physical route for one state, not that the route is broadly usable.

The native tracker supports a multi-step physical horizon, retaining only the first selected
action and restoring the complete world for each counterfactual. At nominal speed, both a
one-step and six-step horizon reproduce the measured reference. Longer horizons compare the
predicted end state against the corresponding future reference, rather than advancing the live
episode during planning. The directional qualification reader independently rejects late or
non-finite completion times, even when an input row declares success.

Compressing the 16.2667 s feedback demonstration toward 12 s with the one-step native tracker
also fails: no handover in the seventeen-second physical episode, 80,281 world steps and
355.11 wall-clock seconds. This is the same Node/engine/body/actuation/balance configuration.
The native tracker can preserve an exact action prefix before compressing the remainder;
the prefix remains part of the recovery clock, rather than becoming a new episode origin.
The twelve-step horizon without a preserved prefix is stopped at its wall allocation with
550,236 steps charged, including the interrupted evaluation reservation. Its last durable
physical prefix is 9.5083 s with no handover and torso height about 0.246 m. That checkpoint
records 1,219.35 s; manual budget enforcement has an overrun. This is a censored failure to
find a recovery, not a completed seventeen-second trial. Native search now also enforces a
finite wall budget between selected physical steps and retains its elapsed budget on resume.
Preserving the initial 120 physical steps also fails to produce a recovery before its wall
allocation is closed: 476,625 steps charged, including the interrupted reservation. Its last
durable prefix is 9.0083 s, including the preserved second, with no handover and torso height
about 0.204 m; the saved checkpoint records 1,135.89 wall-clock seconds. This trial is likewise
censored rather than a completed twelve-second target rollout. The exact executing native
module is retained alongside the local checkpoint and verified against its recorded digest.

The campaign closes without a qualifying candidate. Neither shortened motion tracking nor
optimization of the existing recipe provides the requested fast, robust recovery in these
experiments. The reusable result is a validated search/replay environment and a faster but
narrow slow witness. A new runtime variant, repeated-fall/disturbance/combat checks, visible
motion review and final qualification remain undone. These failures do not establish that
the body or Rapier makes the requested movement impossible.

Reproduce these experiments with separate output paths:

```powershell
node research/stand-up-search.mjs record --degrees 90 --output .review/stand-up/lab-right.trace
node research/stand-up-search.mjs replay --input .review/stand-up/lab-right.trace
node research/stand-up-search.mjs pilot --input .review/stand-up/lab-right.trace --output .review/stand-up/pilot.trace --workers 3 --generations 12
node research/stand-up-search.mjs record --degrees 0 --seconds 12 --output .review/stand-up/front.trace
node research/stand-up-search.mjs search --input .review/stand-up/front.trace --reference .review/stand-up/lab-right.trace --output .review/stand-up/targets.trace --representation targets --knots 4 --workers 3 --generations 100 --stepBudget 1360000 --wallSeconds 1200
node research/stand-up-sole.mjs
node research/stand-up-native.mjs --input .review/stand-up/lab-right.trace --output .review/stand-up/native.trace --seconds 20 --iterations 1 --stepBudget 225000
```

Search output checkpoints retain full optimizer state; rerunning an identical configuration
resumes it. Native checkpoints retain the selected physical prefix and optimizer action.
Complete action/observation traces are compressed local artifacts, not new runtime policies.
These experiments have not qualified an additional recovery variant.

## Published-controller and assisted-recovery campaign

The campaign qualifies a substantial assisted improvement, with the full four/six-second target
still open. The final qualification and limitations are below. The original case manifest is
`research/stand-up-learning-cases.json`; local resumable artifacts and the campaign ledger live
under ignored `research/runs/get-up-learning/`. The reference checkout is pinned to
`tianxintao/get_up_control` revision `5ad52fbe1b5b7c56522a1aa10ccf17fb81c0d79e`.
It has no license file, so upstream code, assets and pretrained weights remain local and are not
redistributed. `research/stand-up-reference.py` executes that separate checkout.

The reference reproduction exposed a checkpoint-configuration mismatch. The CLI's teacher power
0.4 leaves the supplied teacher crouched under both modern dependencies and the original stack
(Python 3.8.10, PyTorch 1.5.1, MuJoCo 2.1.3, dm_control 1.0.1). The supplied student's metadata
records teacher power **0.663420431**, consistent with the teacher's final curriculum strength.
With that recorded power, the teacher reaches the upstream head-height criterion (>1.4 m) in
4/4 physical fallen starts: 0.625, 1.075, 1.525 and 0.725 seconds after reset. Final head heights
are 1.46-1.475 m; rendered playback was inspected. These are upstream MuJoCo results at 200 Hz
physics and 40 Hz policy, not game qualification or successful retraining.

The supplied student also reaches that upstream criterion in 2/2 starts, at 1.225 and 2.15 seconds.
Its actual physics clock advances 0.025 s per policy call (800 Hz internal physics), despite the
environment's nominal control-timestep field reporting 0.00625 s. The runner measures elapsed
physics time directly. Use `reference-student-clock/`, not the earlier nominal-clock diagnostic.
Raw reports, trajectories, video and checkpoint digests are in `reference-recorded-power/` and
`reference-student-clock/`. The stricter head-height/quiet diagnostic in those reports remains
separate from the upstream criterion; neither substitutes for the game's physical evaluator.

Learner updates change parameters, checkpoint loading restores identical deterministic actions,
and another update succeeds. This is a short train/update/resume smoke test, not reproduction of
the ten-million-transition training schedule. The isolated modern environment uses Python 3.11.11,
PyTorch 2.5.1 CPU, NumPy 1.26.4, MuJoCo 3.1.6 and dm_control 1.0.20; the original stack is retained
as a compatibility control. Upstream code/assets/weights remain outside the committed repository.

The research action port now accepts explicit root force/moment requests, clips them through the
existing Balance mechanism, records delivered assistance in replay tapes and accepts assisted
outcomes only when a positive Balance ceiling was declared. Omitted requests clear the recovery
wrench. Zero-Balance behavior and its original complete action-tape replay remain covered.

Initial game pilots use Node Stance Lab, gameplay Rapier adapter 11, 120 Hz, symmetric actuation,
Warrior, empty hands, original anatomy and Balance 100 throughout (including before the fall).
These are development trials; changed pre-fall assistance prevents a causal comparison with the
previous zero-Balance witness. All use the real two Front shoves of 60 N s, 0.2 s apart.

| Feedback pilot | Result after 12 s or evaluator termination |
|---|---|
| Vertical unloading plus righting torque | Tilted equilibrium, root up normal 0.603 |
| Stronger righting feedback | Tilted equilibrium, root up normal 0.752 |
| Add horizontal feedback toward the feet | Root up normal 0.998, but no quiet-standing handover |
| Release to ordinary host after acquiring an upright stance | Quiet-standing handover in 3.2833 s; fails the walking tail with about 0.0804 m displacement against 0.1 m required |

The last pilot takes actual host strides and remains upright, but it is not a completed recovery
under the frozen evaluator. No timing or displacement gate has been relaxed. The scripts and
full pilot settings are `research/stand-up-assist.mjs` and local `assist-100-*.json` records.
These pilots motivate horizontal assistance and explicit host handover; they do not establish
coverage over other falls, loadouts, bodies or assistance levels.

The Rapier adapter has 151 observations and 41 actions: 35 actual muscle channels plus six
root-wrench components, evaluated at 40 Hz over 120 Hz `World.step`. Observations use local-frame
orientation/velocity, normalized joint positions/rates, extremities, loaded contacts, action
history and declared configuration. Torque signs, legal reference-relative targets and speed-
dependent effort remain in the existing muscle path. The residual-feedback ablation adds four
observations for its remembered heading and release state; its full asymmetric joint corrections
and wrench corrections are explicitly separate from the published direct-torque representation.

The port retains the published SAC implementation in the local checkout. Method deviations are
explicit: 256-sample batches versus the saved reference's 1024, 200,000 replay capacity versus
one million, one learner update per three parallel transitions, 12-second training episodes,
body-scaled height reward, an approximated velocity penalty, and a physical completion bonus.
The 256-hidden-unit network and residual feedback are bounded ablations of the 1024-unit direct
muscle/wrench pilot, not a faithful reproduction claim. Curriculum advancement is not implemented
yet. Ordinary host release and walking still decide completion independently of shaped reward.

The persistent three-worker bridge resumes physical worlds, observations, replay, optimizers,
PRNGs and counters. A 120-transition/30-update smoke run resumed to 240 transitions/70 updates;
physical counts advanced from 1,694 to 2,054 without resetting. The fast regression restores and
compares complete physical transitions, rewards and action history, and rejects invalid actions
atomically. This establishes adapter correctness, not learned recovery.

A 20-case feedback pilot covered Balance 0/10/25/50/100 and four cardinal shove directions.
Five configurations prevented the requested fall; the other fifteen produced no complete
recovery under the then-current evaluator. This exposed a support-measurement defect: selecting
only geometric foot corners within 1 mm of the lowest corner discards loaded corners of slightly
tilted feet. The evaluator now uses actual loaded, penetrating Rapier contact-patch points.
The Balance-100 side trial is consequently recognized as quietly supported at 3.7917 s, but
still fails the walking tail. A regression exercises this real tilted-foot configuration.
Prior results using the old support calculation need re-evaluation before comparative claims.

The walking shortfall also occurs without a fall. Node Stance Lab, original Warrior, empty hands,
120 Hz, after four seconds standing: a 0.3 m/s forward command moves 0.09919 m in one second at
Balance 0 and 0.08844 m at Balance 100. Asking 0.6 m/s gives 0.10022 and 0.08898 m respectively.
This diagnoses a host-startup limitation, not permission to relax the 0.1 m qualification gate.
No complete recovery or qualified new gameplay variant is claimed.

The 15-minute direct-muscle pilot (1024 hidden units, CPU, seed 120) completed 16,062 transitions,
2,021 updates and 78,240 physics steps in 904.06 seconds, with no complete recovery. Warm-up
collection was much faster than learning; the full published ten-million-transition schedule
is not credible at this measured CPU update rate within the campaign allocation.

The five-minute residual-feedback ablation (256 hidden units, CPU, seed 120, residual scale 0.15)
completed 15,693 transitions, 4,232 updates and 92,303 physics steps in 300.89 seconds. It produced
several successful training episodes, but not a qualified policy. That pilot also exposed a reset
bug: some fallback shoves still prevented falling, so the learner received stationary high-reward
samples. Reset now records every attempted shove, follows the declared 90/120 N s fallbacks,
and resamples random training falls instead of training on prevention. Explicit evaluation cases
retain prevention as a separate outcome. The affected pilot is a development seed, not a clean
curriculum comparison.

Frozen deterministic evaluation of that pilot under the corrected contact/release evaluator:
Node Stance Lab, gameplay Rapier, 120 Hz, original Warrior, empty hands, Balance 100 for recovery
and host, four development cardinal directions (not held-out qualification):

| Requested direction | Executed impulse | Quiet handover | Complete standing/walking tail |
|---|---:|---:|---|
| Front | 60 N s twice | 3.3083 s | Pass |
| Right | 60 N s twice | None by 35 s | Fail |
| Back | 90 N s twice, after prevention at 60 | 2.5750 s | Pass |
| Left | 60 N s twice | 3.1750 s | Fails walking displacement |

Both NumPy double-precision inference and the deterministic core ReLU/tanh evaluator reproduce
these outcome records. This passes the Front feasibility target at the declared assistance,
not the substantial-improvement or robustness gates. Requested-versus-executed fall recipes,
physics identities and trapezoidal root-wrench work/magnitude meters are retained in local
`residual-256-core-development.json`. Recovery assistance must release before quiet time counts;
the ordinary host's declared Balance may remain during the verification tail.

Reproduction commands for the implemented learning path (local upstream checkout required):

```powershell
.tools/get-up-venv/Scripts/python.exe research/stand-up-reference.py --output research/runs/get-up-learning/reference-recorded-power
.tools/get-up-venv/Scripts/python.exe research/stand-up-train.py --config research/runs/get-up-learning/residual-config.json --hidden 256 --batch 256 --warmup 3000 --wall-seconds 300 --step-limit 500000 --output research/runs/get-up-learning/residual-256-pilot
.tools/get-up-venv/Scripts/python.exe research/stand-up-evaluate.py --actor research/runs/get-up-learning/residual-256-pilot/actor.json --output research/runs/get-up-learning/residual-256-core-development.json --workers 3
```

The local residual configuration is `{"balance":100,"mode":"residual","residual":0.15,
"seconds":12,"seed":120,"actionRepeat":3}`. Use a fresh output directory with corrected reset
semantics; exact resume rejects changed environment identities. `--warm-start` explicitly carries
network ancestry into a new experiment and restarts replay/optimizers; it is not exact resume.

The right-side deterministic failure is a premature handover, not an unexplained stalled solve.
At about 1.73 s after takeover, root horizontal speed is about 1.98 m/s and only the right foot is
loaded; the old geometric release fires shortly afterward. The host develops large angular motion,
then leaves the finite test floor. `policy-right-release.json` preserves the divergence. A controller
probe requiring actual quiet support before release reaches quiet host standing in 5.18, 5.70 and
5.39 s for Front/Right/Left, respectively; all three still fail the separate walking-distance tail.
Back's 60 N s recipe prevents falling and is not counted. Off-surface motion now terminates as an
explicit failure, rather than consuming the rest of a timeout. No qualification threshold changed.

The terminal reward also needed correction. With unit standing reward and discount 0.97, ending
success with a bonus of 10 undervalues successful termination relative to continued standing.
Success now includes the absorbing standing state's value `1/(1-0.97)`; failures remain terminal.
This is a task adaptation, distinct from the original reference environment's continuation rules.

CUDA installation succeeded in a separate Python 3.11 environment with PyTorch 2.5.1+cu124 on the
RTX 4060 Laptop GPU. The corrected-reset CUDA residual pilot completed 15,069 transitions, 4,024
updates and 98,827 physical steps in 300.98 s. That is similar throughput to the small-network CPU
pilot, not evidence of a large GPU speedup. Its exact source is commit 49d61fab. Subsequent pilots
record separate action, rollout, reset, update and checkpoint wall times, plus source snapshots;
GPU RNG state is included in checkpoints. Older pilot checkpoints retain their separate identities.

The bounded 15-minute comparisons finished on the fixed body. Direct torque with strength 1.5 /
Balance 0 completed 14,391 transitions and 58,362 physics steps; direct torque with strength 1 /
Balance 100 completed 13,735 transitions and 68,649 steps. Supported-release residual control
completed 13,484 transitions and 67,896 steps. None completed a training episode under the strict
host tail. Deterministic evaluation of the supported residual completed one of four development
cardinals; another reached quiet handover but failed walking. These short runs do not demonstrate
that either learning curriculum is impossible. They justify solving the easier terminal task before
allocating the main learning budget.

The required staged-rise and support-recovery screen used the original body, both model/loadout
groups and both stance/SIMBICON hosts, Balance 100, gameplay Rapier at 120 Hz. Staged rise completed
8/16 cardinal cases by 35 seconds and support recovery 7/16, with none within 12 seconds. Staged
rise is the frozen principal comparator; support recovery remains reported. An earlier optional
Dynamic rise probe threw `a supported rise requires its actual supports and trunk clearance` and
is retained as a failed diagnostic, not substituted for staged rise. Final matched comparisons
must use the production release path without the research action override's automatic handover.

The existing SIMBICON host moves the original Warrior 0.11432 m in the one-second, 0.3 m/s
never-fallen walking probe at either Balance 0 or 100. It is explicitly selected in the assisted
configuration; this is not a change to ordinary gameplay's locomotion default. Strict support
release with SIMBICON completed the four Warrior development cardinals in 5.1833, 5.7000, 7.1833
and 5.3917 seconds (Back used the declared 90 N s fallback after prevention at 60).

The first 64-case feedback selection completed 52/64 within 12 seconds, but target-coordinate
inspection exposed a real controller bug: guard angles were already reference-relative, and the
new adapter subtracted bind again. Initial physically built guard angles and live muscle readings
agree without that subtraction. Correcting it removes inward arm pressure and narrowed feet;
those earlier controller results are not evidence for the corrected configuration.

Six collision-aware whole-body IK terminal poses were generated with stagger +/-0.15 or 0 m,
width 0.8 or 1 times the reference spacing, and pelvis 0.02 m lower. All were geometrically feasible.
Physical trials on three diagnosed failures showed why that alone is insufficient: some poses
failed the host walking tail, and one took 14.425 s. The +0.15 m stagger at reference width cleared
all three. A 64-case development selection with that pose completed 61/64 within 12 s; group
failure-inclusive medians were 3.8500, 3.4833, 3.3625 and 3.7083 s for Warrior empty/club and Rogue
empty/club. This passes the substantial **selection partition only**, not final qualification.
`research/stand-up-terminal.mjs` regenerates the six geometric candidates; retained targets execute
through ordinary joint commands, not installed poses or playback.

Runtime parity testing caught a second adapter discrepancy: research used 9.81 m/s² while the
actual world uses 9.80665. Both now derive weight from the world's gravity, as Assist does. Exact
physical observations and delivered commands agree through a full Front recovery. Contact-state
restore, retained club grip, withdrawal clearing and zero-allowance fallback also pass focused
physical tests. New full-episode tests are in the slow tier. No qualification claim uses a tolerant
comparison to conceal divergent physical trajectories.

The first actual runtime selection completed 62/64, but Rogue club Back failed a required cardinal,
so this does not pass the selection gate. Diagnosing the two remaining failures found distinct
conditions. Rogue empty at 247.5 degrees stood nearly motionless with only three penetrating foot
patch points and continued upward help (~66 N); its COM was outside the resulting support triangle.
A slightly lower terminal height cleared it. Rogue club Back handed back to a host whose occupied
hand contacted its chest: the IK seed had also replaced the held-item wrist target with an empty-hand
one. Preserving the ordinary held-item guard cleared that case. Combining a permanently lower
height with the guard correction did not clear Back. A bounded late lowering, after four seconds
without release and blended over one second to 98% height, clears the diagnosed empty case in
5.075 s and preserves Back at 3.725 s. Front/Right development controls pass at 4.2333/4.025 s.
The actual runtime selection passes 64/64 within six seconds, with group medians 3.8500,
3.5750, 3.3583 and 3.4417 s. This is selection evidence, not independent qualification.

Three independent seed-120/121/122 SAC runs compare smoothed small residuals around the staggered
feedback control: 256 hidden units, 0.05 residual, 0.15 s action filter, 40 Hz policy, ordinary 120 Hz
physics, SIMBICON host and Balance 100. Each has a 30-minute/600,000-step cap and exact source
snapshot. These runs retain their original generating controller; later runtime fixes are distinct
experiments. Training successes do not establish added value over the feedback controller.

Before inspecting final outcomes, the validation generation protocol was made explicit: the frozen
128 non-grid shove recipes retain their settle prefix, then add 180 zero-activation, zero-assist
physical steps so that testing includes lying starts. The original takeover clock continues through
that prefix. Actual orientation is classified from the pelvis, and each group must include prone,
supine and both sides; missing coverage fails qualification. Selection uses immediate recovery.
Repeated sequences retain the same body, world, host and assistance history after each complete
standing/walking tail. Disturbance trials add their frozen lateral shove without restarting time.

The Lab exposes live assisted feedback separately from the slow searched witness. The selected
variant uses original rigid feet, unchanged muscle capacity and explicit Balance 100; no anatomy
or ordinary gameplay defaults change. Its instantaneous help and ceiling, recovery control time,
phase and release are visible. Browser review observed an actual Front fall, active help, upright
return and zero delivered help after release, in both skin and collision-shape views. This is a
page demonstration, not a replacement for independent Node qualification or the walking tail.

The first independent 128-case lying-state validation completes 114/128 within 12 seconds,
107/128 within six. It fails the substantial gate (116 total and 28/group required), so the
candidate remains experimental. Observed failures include insufficient host walking displacement,
no quiet supported handover, and one recipe whose stronger fall attempts were all prevented.
The set is retired to development if used to repair the controller; fresh validation is required.

The three 30-minute filtered SAC runs complete 80/82, 78/79 and 78/78 training episodes. Their
exported deterministic four-cardinal development evaluations complete 4/4 each by 35 seconds,
but seed 121 takes 13.3833 s on Front. Seed 120 takes 3.7000, 3.4333, 2.2667 and 3.7750 s.
Core-versus-NumPy inference on 64 replay observations per seed differs by at most 1.2e-15;
full exported closed-loop episodes are evaluated separately. These results do not yet establish
an advantage over the fixed feedback controller on varied bodies or held items.


### Support-transition corrections and confirmation

All figures here use the Node Stance Lab recovery harness, gameplay Rapier coordinate engine,
120 Hz, unchanged Warrior/Rogue anatomy and muscles, and Balance 100 for recovery and SIMBICON
host unless a recovery-only allowance is stated. The late centring correction stops upward help
and moves the whole-body centre toward the feet while retaining righting feedback. It completes
126/128 on the retired lying-state set, versus 114/128 before that correction, and preserves
64/64 directional selection successes. Those repaired cases are development data.

Six Rogue-specific whole-body IK terminal seeds were also executed on four difficult falls.
The +0.15 m stagger at reference width completed all four, whereas straight symmetric legs
completed none. Replacing the primary pose everywhere lost a different selection case (31/32
Rogue selection successes), so the model-specific pose is instead a bounded, smoothly blended
alternate after six seconds without handover. The simple compliant-sole pilot completed three
of four difficult cases, the same count as rigid feet with different failures. It did not justify
changing the body or expanding palm/toe/material branches.

A fresh confirmation manifest, seed 120102026, was frozen before evaluation. Its prefix audit
found a missing Warrior/club side orientation. The predeclared coverage rule replaced one
non-lying case with the first reserved recipe reaching that side, before recovery outcomes were
examined. With the alternate pose, confirmation completed 124/128 lying falls within 12 seconds
(group medians 4.9500, 5.0917, 4.7458 and 5.0125 s, including the 1.5-second passive prefix), and
all 16 same-body three-fall sequences. Fifteen sequences met six seconds on every fall. However,
only 28/32 disturbed cases completed, so this candidate did not qualify. The whole confirmation
set is retired after its failures informed the next correction.

The three actual disturbed failures were mechanically distinct from the nearly quiet Rogue
failures: two Warriors held a roughly one-metre split stance with large hip tracking errors,
and one retained-club Warrior had loaded foot-to-foot contact. A bounded physical search tried
18 combinations of start time (4/6 s), duration (0.5/1/1.5 s) and knee flexion (0.6/1/1.4 rad)
on each of these three states. All 54 completed. The selected conservative correction starts
only after six seconds, folds for half a second with a one-radian knee target, and uses the same
one-body-weight ceiling to unload the feet; it does not reset the recovery clock.

A factorial ablation on the same three generating recipes identifies the useful intervention.
Neither intervention completed any case. Folding alone failed the split stances and took
12.5833 s on the overlapping feet. Unloading alone completed the two split stances in
7.9417/7.9500 s but failed the overlapping feet. Combining them completed all three in
8.0917/8.0750/8.7167 s. The production correction preserves 64/64 selection successes and
completes 31/32 on the retired disturbed set; the remaining recipe never fell. These are still
repair measurements, not independent qualification. An additional 0.1-second release fade is
used when the last recovery wrench is nonzero; an already-zero wrench needs no fade delay.

The two-unit Node Arena check uses Puncher minds with SIMBICON, the new recovery and Balance 100
on both sides, plus two scheduled shove pairs. The Warrior returns to combat after three
recoveries, the Rogue after one, and both take further wounds after returning upright. A save at
step 330 continues with identical per-step pose and control/wound digests across the second
recovery and later contacts. The initial run averaged 2.24 ms/world step for both units with
other research running (p95 4.96 ms, peak JS heap 135 MB). This is a harness/load-specific reading,
not an isolated policy-only benchmark. The strengthened gameplay script also checks complete
saved-state equality and requires actual returns and subsequent combat.

The same-fall assistance pilot holds ordinary-host Balance at 100 and clips only recovery help.
Before the unloading correction, all 16 cardinal body/loadout cases complete within 12 seconds
at recovery allowance 100; none complete at 0, 10, 25 or 50. These are recovery-only causal
comparisons, not zero-Balance gameplay results. The selected controller is re-evaluated after
its final changes before those figures are used as its assistance evidence.

`research/stand-up-holdout-v3.json` reserves another independent set. It preserves the same
bounds and physical coverage audit, and predeclares orthogonal/reversed 120 N s fallback recipes
when the aligned stronger shoves still prevent falling. Prevention is recorded separately and
never counts as a successful get-up. No outcome from that set is used for tuning.


### Release stability and the next independent set

The frozen unloading/fade candidate completes 63/64 directional cases within six seconds,
126/128 V3 lying-state cases within twelve seconds (120 within six), and 32/32 disturbed cases
within twelve seconds (30 within six). It fails the repeated-fall gate at 14/16 whole sequences.
These are Node Stance Lab results at 120 Hz, gameplay Rapier coordinate engine, symmetric muscles,
original bodies, recovery Balance 100 and ordinary SIMBICON host Balance 100. V3 is retired after
its failures inform the next correction; its passing partitions do not qualify the corrected policy.

The failed sequences distinguish two mechanisms. Warrior empty, 189.50688888015847 degrees,
120 N s twice, reaches physically ready support repeatedly, but transient contact loss restarts
its 0.1-second wrench fade. The scheduled six-second foot pulse can also interrupt that release.
A latched fade holds the remaining wrench at zero through transient patch loss, suppresses the
foot pulse during release, and rearms help only after one second with lost upright foot/trunk
orientation. Actual physical support still gates handover, and quiet standing plus the host tail
still gate completion. The exact physical regression now completes within twelve seconds.

Rogue empty, after successful recovery from 318.58400484753724 degrees and its walking tail,
stalls on the next 288.5692672786357-degree fall. It is nearly motionless with upright feet, but
its centre is outside their loaded patch. A saved-state ablation aiming late horizontal feedback
at the actual penetrating patch centroid completes in 5.40 seconds at gain 2, versus no completion
within twelve seconds without that correction. However, enabling it broadly loses other host-tail
successes: contact-centre plus latched release finishes 62/64 selection and 14/16 retired repeated
sequences. It remains an explicit disabled experiment, not the selected runtime setting.

Latched release alone preserves all eight earlier physical regressions and passes the new
transient-contact regression. It completes 63/64 selection within twelve seconds (62 within six)
and 15/16 retired repeated sequences. The remaining selection failure is Warrior club at 22.5
degrees, which reaches quiet handover in 5.1917 seconds but fails the one-second walking-distance
check. The remaining retired repeated failure is retained, not omitted from the count.

The uniform-friction margin probe applies the declared coefficient to all colliders before every
solver step, including recreated hand colliders. At 0.4, 0.5 and 0.6, each of the sixteen cardinal
body/loadout cases completes within twelve seconds with the pre-latched candidate (48/48 total).
An earlier partial probe set friction only at construction and is discarded. This is an explicit
research engine-law perturbation, not a changed gameplay material or arbitrary-surface claim.

The pre-latched candidate also completes two forced recoveries in a thirty-second two-unit Arena
bout. Both fighters return to active wounded combat; 200 contacts are recorded. Restoring the
checkpoint reproduces every physical pose, control/wound trace and the complete final saved state
exactly. Under concurrent research load the Node whole-world mean is 2.70 ms/step and p95 5.39 ms,
with peak sampled heap 106 MB; this is not isolated controller cost. The final selected candidate
receives a separate gameplay run.

`research/stand-up-holdout-v4.json`, seed 1210202604, reserves fresh lying, disturbed and repeated
cases with the same bounds and predeclared coverage procedure. Its recovery outcomes are not
used to choose or tune the frozen release-only candidate. `research/stand-up-diagnose.mjs` captures
complete failing continuations and prior successful falls, with exact-source/configuration checks.


### Qualified assisted result

The selected runtime is `assisted-rise`, with the configuration in
`assets/core/assisted-rise.json`, original Warrior/Rogue anatomy, unchanged symmetric muscles,
gameplay Rapier coordinate engine at 120 Hz, and **Balance 100 for both recovery and the ordinary
SIMBICON host**. It is an additional choice; no normal character, locomotion or recovery preset
is replaced. The selected policy source is commit `58b5e809`. All four final partitions have the
same policy SHA `42090123be733e59d9f49972ced16905b0923f90b59ead49f0cc8379130193c3` and source SHA
`dc3c1ab2d175d9ae95ce480698dccca020122633f0cf2aabaf13018e004ec6fb`.

These are Node Stance Lab results, with real falls, actual loaded foot patches, upright trunk and
soles, 0.5 seconds below 0.1 m/s segment speeds, released recovery help, two seconds of ordinary
host standing and one second walking at least 0.1 m. The handover clock includes preparation,
retries, settling and the quiet check; verification follows without increasing that deadline.

| Final partition | Within 6 s | Within 12 s | Within 35 s | Substantial gate |
|---|---:|---:|---:|---|
| Directional selection | 62/64 | 63/64 | 63/64 | Pass |
| V4 independent lying starts | 116/128 | 126/128 | 127/128 | Pass |
| V4 repeated sequences, three falls each | 10/16 | 16/16 | 16/16 | Pass |
| V4 disturbed recoveries | 29/32 | 30/32 | 31/32 | Pass |

All 48 actual recoveries in the repeated sequences complete within 12 seconds; the slowest is
8.5333 seconds. The V4 prefix audit covers prone, supine and both sides in every model/loadout
group without replacements. Validation group success counts within twelve seconds are
32/32, 32/32, 31/32 and 31/32 (Warrior empty/club, Rogue empty/club). Failure-inclusive group
medians are 5.2083, 5.3333, 4.9750 and 5.0375 seconds, including the 1.5-second passive prefix.
The full target fails: neither the four-second validation median nor all six-second reliability
requirements are met. These finite engineering cases do not establish population-level human
reliability or recovery under arbitrary disturbances.

The frozen principal comparator is staged rise, selected before the final candidate. All rows
below use the same original bodies, gameplay engine, 120 Hz and symmetric muscle path. The first
four also share ordinary-host Balance 100 and SIMBICON; the last is a separate combined-product
comparison with original zero-Balance/stance-host play.

| 64-direction comparison | Within 12 s | Within 35 s |
|---|---:|---:|
| Selected assisted rise | 63 | 63 |
| Staged rise, matched assistance ceiling | 0 | 32 |
| Support recovery, matched assistance ceiling | 0 | 28 |
| Staged rise with experimental root-feedback wrench | 0 | 0 |
| Original staged rise, zero Balance and stance host | 0 | 12 |

The matched principal comparison passes the declared improvement margin: 63 additional cases at
12 seconds, with matched spec, host, balance, engine artifact, actuation, source and rate. Its
failure-inclusive median is censored; the new selection median is 3.8083 seconds. The experimental
staged-plus-feedback control replaces its assist request under the shared ceiling; it does not
stack two allowances or replace staged joint commands. Simply attaching that wrench to the old
stages does not recover successfully. It is not the principal comparator.

The final same-fall causal assistance test keeps host Balance 100 throughout and clips only
recovery requests. Across sixteen cardinals, allowances 0, 10, 25 and 50 produce no complete
recovery within twelve seconds; allowance 100 completes all sixteen. This selects the lowest
successful *tested* allowance, not proof of an exact minimum. The actual lower-Balance runtime
uses existing support recovery; the clipped-policy ablation is a separate experiment.

The final friction probe passes 16/16 cardinals at each uniform coefficient 0.4, 0.5 and 0.6.
These research laws are applied before every solver step, including recreated hand colliders.
Gameplay remains at its original friction law. The final two-unit Arena checkpoint test repeats
the physical/control/wound continuation and complete saved state exactly, returns the Warrior
from two forced recoveries at bout times 5.8 and 17.4 seconds, and resumes wounded combat with
200 recorded contacts. The under-load world-cost reading is kept distinct from the active-policy
callback measurement in `research/stand-up-results.json`.

Browser review uses the owner's existing server without restarting it. The shared entry is
`?play=lab&scenario=recovery&balance=100`. The page visibly runs active assistance, releases it,
returns to the real host and moves on command, in skin and collision-shape views. The final
Rogue club 202.5-degree example reports 5.93 seconds of recovery ownership, zero assistance after
release, and 0.17 m/s while walking; those page readings are distinct from Node quiet-handover
qualification. Repeat two shoves preserves the existing body. A caught shove is prevention, not
get-up success. Lab stress buttons retain both slow examples and the failed walking check.

Remaining counterexamples are explicit. Warrior club 22.5 degrees reaches quiet handover but
fails walking displacement. V4 Rogue empty 138.09744842204964 degrees remains unrecovered by
35 seconds after its supine prefix; another Rogue club validation case finishes after twelve.
The disturbed Rogue empty 266.52743375860155-degree case does not finish by 35 seconds, while
Warrior club 326.8404536973685 degrees finishes in 12.1917 seconds. Exact generated recipes,
all deadline failures, delivered-assistance summaries and raw-report hashes are in the compact
`research/stand-up-results.json`; full local reports and saved worlds remain under the ignored
campaign directory. No held-out outcome is used to change the final candidate.

The learning branch remains a method adaptation, not a learned production-policy success claim.
The reference pretrained teacher/student execute locally and published SAC updates/resume work;
full ten-million-transition retraining is not completed. Three independent thirty-minute adapted
SAC runs produce successful episodes, but the selected seed's 61/64 directional results do not
beat the simpler feedback controller. The browser therefore runs deterministic feedback and
ordinary muscle commands, with no training library or neural weights loaded. Whole-body IK
supplies a useful terminal seed; its geometric feasibility alone never determines success.
The sole pilot gives no net gain, so broader palm/toe/morphology searches are stopped. Automated
strength/assistance curriculum advancement is not implemented; the fixed-stage pilots and
retained assisted result are reported as such.

These results qualify only the separately labeled assisted experiment under its historical
criteria. They do not satisfy the owner's unassisted objective or justify declaring the work
complete. The comparison also omitted the best recorded optimized recipe; its apparent margin
must not be reported as improvement over that recipe. Fast, robust unassisted recovery,
learned added value and broader body/surface experiments remain unfinished.


The active recovery callbacks, including observation/support reads, take a combined mean of
0.270-0.497 ms per physics step across sixteen cardinal body/loadout trials on the i7-13700H.
No other agent physics worker runs during this reading. `wants` and `step` are timed separately;
this is controller cost, not total world-step cost. Instrumented outcomes match the selection
outcomes exactly. Requested and delivered wrench peaks/integrals are recorded separately;
for example, the Warrior Front requests a peak 2,553.5 N while its delivered peak is limited to
774.7 N. This does not increase muscle strength or bypass the Balance ceiling.

At qualification, the ledger charges 9,058,899 physics steps: 6,943,899 explicitly recorded steps
plus 2,115,000 conservative allowances for reference/setup, interrupted probes, tests and browser
work. Conservative charges are not claimed as measured executed steps. The 24-million-step
validation reserve remained unused inside the 160-million cap. Work stopped after about 4.3
active hours. The assisted result did not justify early completion of the owner's goal; neither
the nominal 24 hours nor the full published training schedule ran.

Reproduce the selected physical gates from the committed configuration:

```powershell
node research/stand-up-campaign.mjs --partition selection --workers 3 --output research/runs/selected.json
node research/stand-up-campaign.mjs --partition validation --manifest research/stand-up-holdout-v4.json --workers 3 --output research/runs/validation.json
node research/stand-up-campaign.mjs --partition repeated --manifest research/stand-up-holdout-v4.json --workers 3 --output research/runs/repeated.json
node research/stand-up-campaign.mjs --partition disturbed --manifest research/stand-up-holdout-v4.json --workers 3 --output research/runs/disturbed.json
node research/stand-up-gameplay.mjs research/runs/gameplay.json
node research/stand-up-assistance.mjs research/runs/assistance.json
node research/stand-up-friction.mjs research/runs/friction.json
node research/stand-up-cost.mjs research/runs/cost.json
```

Comparator configurations, their matched identities and all failed case recipes are embedded in
`research/stand-up-results.json`; pass the chosen configuration as `--config` to the campaign
runner. The existing complete raw reports, training checkpoints, optimizer/replay/PRNG state,
source snapshots and three actor exports remain local and resumable at their generating source.
Upstream reference assets/code/weights remain local because no upstream redistribution license
was found. The final repository gate is type checking, the fast suite, browser build, the nine
focused physical regressions, qualification checks and whitespace/line-ending checks. Existing
six-second and other TODOs remain visible.


## Frozen unassisted comparison

`stand-up-acceptance-v1` is the named Git commit for the evaluator, baseline and saved falls.
The owner's acceptance criteria may not be changed without agreement. This is a reproducible
**development comparison**, not a replacement qualification or evidence that recovery is solved.

Run from that checkout, with Node 24.15.0 and the lockfile-installed dependencies:

```powershell
node research/stand-up-acceptance.mjs
```

The command refuses a different HEAD or tracked-file edits. It compares the ordinary support
controller against the best recorded optimized recipe (`stand-up-feedback-seed.json`, the
15.5583 s Front witness), then proves that the shipped floating controller is rejected. The
report is `.tools/stand-up-acceptance/report.json`; exit zero means the comparison ran and its
controls passed, **not that a controller met the recovery goal**. External-actuation violations
by a candidate produce exit code 2. Exceptions, identity mismatches or an incomplete run are
errors, never successful comparisons. Partial reports lack a final summary.

Sixteen committed compressed checkpoints cover Warrior and Rogue, each empty-handed or with a
right-hand club, at four cardinal shove directions. All use the existing compliant soles,
unchanged default muscle/body properties, the stance host, Balance 0, symmetric actuation,
gameplay Rapier coordinate engine at 120 Hz and the same ground. The snapshots contain complete
physics, world, host, skills and recovery state. The original optimized recovery prefix is shared
by every continuation and remains included in elapsed time. These are not independent fresh-fall
candidate trials, repeated falls, disturbances or held-out robustness evidence.

The prefix audit allows exactly the two declared chest impulses at steps 240 and 264, and no
other external actuation. From restoration through standing and walking, the evaluator records
all segment-body force, torque, impulse and angular-impulse calls at the engine interface; it
also rejects pinning and mass changes. Zero in a later step or an opposite force cannot erase
an earlier violation. This catches calls outside the ordinary Assist meter. Solver gravity,
physical contacts and bounded joint motors remain permitted. The actual floating controller is
run from the same first checkpoint with Balance 100 enabled expressly as a negative control;
its external force and moment invalidate it immediately. That is not a performance comparison.

The unchanged physical completion predicate requires upright trunk and soles, actual loaded
foot patches, centre of mass in support, quiet motion for 0.5 seconds, ordinary-host handover,
two seconds standing and one second walking at least 0.1 m. Help is forbidden during that entire
tail as well as recovery. Handover later than 35 seconds fails; the episode allows a further
three seconds to verify it. Counts at 6, 12 and 35 seconds and failure-inclusive medians are
reported without deleting failed cases. No new threshold defining substantial improvement or
human-level robustness is introduced. Full physical trace hashes and results of the frozen
optimized baseline must reproduce on every command run.

Other existing controls can be compared with `--controller dynamic` or `--controller assisted`.
Both run at Balance 0; Assisted therefore exercises its existing fallback. `--controller optimized`
is an identical-continuation reproducibility control. A future experimental action module can
be evaluated without editing the frozen checkout:

```powershell
node research/stand-up-acceptance.mjs --candidate C:\path\to\candidate.mjs
```

The module exports `createPolicy({ channels, configuration })`, returning a function called on
a detached body observation each step. It returns the existing `muscles`, bounded `targets`, or
`host` action accepted by `checkRecoveryAction`. Any requested nonzero assistance is rejected,
even if the ceiling would clip it away. The factory is reconstructed separately for every case.
Place experiments outside tracked evaluator files. Report candidate source and dependency
identities; the command hashes the entry module, not its transitive imports. Changes to the
body, host, engine, baseline or case set require a separately agreed protocol and matched runs.
Do not move the frozen ref. Keep its commit hash outside the experiment when independently
reviewing a result; Git refs and repository instructions are an audit trail, not a security
boundary against someone who can rewrite the evaluator or execute arbitrary candidate code.

To keep working on newer source while running this exact gate, make a detached checkout of
`stand-up-acceptance-v1`, run `npm ci` there, and run the command there with the candidate module's
absolute path. Existing binary checkpoints require the captured Node version; a different
runtime must be separately revalidated, not silently substituted.

### Inspect in the Lab

Use the server for the frozen checkout (or the current checkout while it is that same commit).
If no server is running, `npm run dev` starts it; do not replace another running server.
Open this exact address for the optimized baseline's Front case:

`http://localhost:5180/?play=lab&scenario=recovery&recoveryMode=witness&model=workshop-fighter&right=empty&left=empty&boots=1&armour=1&sole=1&balance=0&hz=120&pushDegrees=0&pushImpulse=60&pushSeparation=0.2`

1. Confirm **Get-up variant: Slow searched witness**, Warrior, compliant soles and Balance 0.
2. Let its automatic two Front shoves run; do not add manual shoves or walking during recovery.
   Watch **Delivered help / ceiling** stay zero. Space pauses; the timeline scrubs recorded motion.
3. After recovery, use **Walk forward for 1 s** to inspect host movement. This manual visual
   check does not replace the Node evaluator's automatic standing/walking tail.
4. Change `pushDegrees` in the address to 90, 180 or 270 to inspect the retained failing cases.
   Change `model` to `workshop-rogue` and/or `right` to `club` for the other frozen configurations.
   Navigate to the full address; **Reset demonstration** resets to the default Warrior Front recipe.
5. To inspect the separate floating variant, choose **Live assisted rise**. This explicitly
   changes to original feet, SIMBICON and Balance 100. Its visible lift and positive help reading
   are assisted behavior and are not unassisted progress.

These existing Lab links generate a fresh fall with the specified recipe; they do not import
the Node binary checkpoint. Node results are the acceptance evidence. Browser and Node physics
are not generally interchangeable, and these instructions do not claim exact cross-runtime replay.
An arbitrary action-module candidate is not automatically exposed as a Lab variant.
