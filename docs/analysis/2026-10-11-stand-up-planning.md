# Stand-up planning and contact experiments

The complete recovery remains unresolved. These experiments establish reproducible diagnosis
and reject particular motion requests; they do not establish a working additional recovery.
The six-second Lab test remains an executed failing TODO, and the directional qualification has
not been run against a new successful route.

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
