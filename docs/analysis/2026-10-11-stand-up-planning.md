# Stand-up by search and measured feedback

The question: can planning, physical search or feedback on a measured reference give the owner's
fast, robust unassisted stand-up (a four-second median, every recovery within six seconds,
[recovery target](../reference/rising.md))? The current answer is no. The best library stands 3
of the frozen screen's 16 falls, none within 6 s; single falls stand in 5.775 to 7.25 s; the Rogue
never stands. The missing component is a collision-clear transition that brings a foot under the
body and carries the weight onto it while the hands still bear. The work is paused for the owner's
review; the selected library plays in the game as **Research rise (experimental)**
(`src/core/mind/rise/research.ts`).

The full log, every run and command, is this file at `d2af6671`. Many of the scripts it ran are
no longer in the tree; the evidence that remains is `research/stand-up-path-results.json` (a key a
section, named below) and the scripts listed under [Reproduction](#reproduction).

## Harness and bar

Unless a section says otherwise: the Node Stance Lab host, `rapier-coordinate` (adapter 11, the
vendored `dimforge-rapier3d-simd-compat-0.21.0-auto-rpg.9.tgz`), 120 Hz, symmetric muscles,
Balance 0, the ordinary stance host. Recovery acts only through the muscles: no pose or velocity
injection, no assist, and every trial audits zero external actuation and an effort-bound excess
under 0.0001 N m.

- **A fall** is two 60 N s shoves 0.2 s apart (Front unless a bearing is named).
- **A recovery** is the frozen evaluator's predicate: upright root and soles, loaded foot patches,
  the mass centre in support, 0.5 s quiet (segments under 0.1 m/s), handover to the host, then 2 s
  standing and 1 s walking at least 0.1 m. The clock counts the whole takeover; a handover whose
  walk fails is a failure.
- **The frozen screen** (`research/stand-up-acceptance.mjs`, evaluator `stand-up-acceptance-v1`
  at `4ebb4d8d`): 16 saved falls, the Warrior and the Rogue, empty-handed and with the club, four
  cardinal bearings. It refuses any assist request and runs a floating controller as a negative
  control.

## Results

| Route | Fall | Best, s | Frozen screen |
|---|---|---|---|
| Staged support recovery (baseline) | Warrior, 90° | 25.275 | 1/16, none in 6 s |
| Recipe search over `supportRecovery` | saved Front | 15.558 | 1/16 |
| Shorter stages and earlier release | saved Front | 12.408 | 1/16 |
| Physical rollout search | saved Front | 7.25 | 1/16 |
| The same, faster phase feedback | saved Front | 6.975 | single fall only |
| Side-fall library | fresh 88°, 60 N s | 5.9 | 2/16 |
| Opposite-side library | fresh 272° | 5.775 | 2/16 |
| Settling-aware search, Warrior with club | saved 90° | 6.033 | 3/16 |
| Rogue, any route | any | none | 0 |

Every time over 6 s fails the bar. No fresh fall more than about 2° or 2 N s from a trained one
stands under the same reference.

## Whole-body IK at a fixed-contact placement

`research/stand-up-ik.mjs` asked for a lead step (0.2 leg lengths aside, 0.3 ahead, flat boot)
from the placement checkpoint of `research/stand-up-replay.mjs`, both hands and the rear shin held.
Forward kinematics agreed with the body to 7e-5 m and the Jacobian to 2.2e-8.

| Variant | Foot error, m | Deepest penetration, m |
|---|---|---|
| Fixed pelvis and spine | 0.304 | 0.366 |
| Floating pelvis | 0.056 | 0.131 |
| Floating pelvis and spine | 0.0016 | 0.160 (thigh through trunk) |
| With collision penalties | 0.145 | 0.011 |

None is feasible on five seeds, and a continuous path fails at its second waypoint. It shows a
conflict in this one request, not global infeasibility; IK stays a planning tool.

## Offline search over the muscles

`research/stand-up-environment.mjs` exposes the muscle commands apart from the phase machine;
`research/stand-up-search.mjs` and `research/cma.mjs` search them from saved checkpoints.

- **Smooth target trajectories** (1,200 candidates a body, four knots, Front): no recovery on the
  original body or the compliant-sole one. The best failure is blocked by the left wrist's
  pronation, 1.84 rad from its target at its 6.33 N m bound; posture error hid it.
- **Receding windows** (`research/stand-up-beam.mjs`): a 5 s failed prefix still near the floor.
- **A one-step tracker** (`research/stand-up-native.mjs`) compressing the 25.3 s baseline to 20 s:
  no handover.
- **Recipe search** over `supportRecovery` (`research/stand-up-feedback.mjs`): 19.17, then
  16.27, then **15.558 s** on the saved Front fall, kept as `research/stand-up-feedback-seed.json`.
  On the 16 falls it stands 1, where the unchanged recovery stands 2 (Warrior empty-handed, Front
  and 180°).
- **Body design** (`research/stand-up-design.mjs`, `research/stand-up-design-screen.mjs`):
  strength x1.5 and x3, speed x2, weight x0.6 and compliant soles under the unchanged controller.
  None stands both Front and 90°; no body change was adopted. Six foot proportions
  (`research/stand-up-foot-design.mjs`) stand none of four falls; weight x0.8 stands one.

## Physical rollout search

The rollout search branches physical snapshots, scores blocks of muscle actions and keeps the best
states. On the saved Front fall it went from 12.408 s (shorter stages, release at action 1158) to
10.81, 8.36, 7.85, 7.44 and **7.25 s** as tilt, load and motion terms and 0.1 s blocks were added
(about 1.5 M steps). It is open-loop for one exact state: the frozen screen stays 1/16, and
neighbouring falls (±1°) fail.

## Feedback on a measured reference

A reference trajectory extracted from a success, tracked by feedback (`research/stand-up-path-policy.mjs`):

- **Phase features** (`research/stand-up-phase-features.mjs`: local gravity, height, floor
  impulses): -1°, 0° and +1° stand in 7.73, 7.25 and 7.13 s; ±0.5°, ±2° and beyond fail. Pushed
  to rate 1.1 it gives **6.975 s** on the saved fall alone.
- **A library** of references, blended by observation (`research/stand-up-library-policy.mjs`):
  six trained starts within ±2° stand in 7.0 to 7.9 s; the eight untrained ones between fail.
- **Measured muscle response** (`research/stand-up-response-policy.mjs`): a local response model
  fitted from perturbed commands, applied by regularized inverse. Four starts stand (7.08 to
  7.78 s); the screen stays 1/16. Prediction error has a median of 0.36 to 0.46.

## Side falls and the library

The saved 90° fall was reached through a recorded prefix and the front-trained response
controller (8.63 s), then a rollout search with ramped motion, contact and sole terms (6.66 s,
exact start only). Re-measured on side trajectories, plain joint-error feedback stood four of
five fresh side recipes, one in **5.9 s** (88°, 60 N s), the first under 6 s. The library's
selector must ignore joint speed (weight 0, root motion 0.01), or it picks the front reference for
side falls. Frozen screen 2/16.

### Opposite-side guidance and feedback

A synthetic mirror of the 5.9 s trajectory (`research/stand-up-mirror-reference.mjs`: limb
channels and hands swapped, lateral flexion and axial rotation reversed, clamped to range) guides
the other side:

- the fresh 272° fall stands in 6.0 s at gain 24; its measured trajectory, tracked at gain 12,
  stands in **5.775 s**, exactly replayed;
- a library of five recipes each side stands **7 of 10**, two within 6 s, a failure-inclusive
  median of 6.6 s, choosing the right side every time, with no saved-state hash;
- the frozen screen stays **2/16**: the saved 270° opposite fall fails all nine trials, and
  searches from it reach a near-upright pose at 3.9 s whose host tail falls.

These are development recipes, not qualification data.

### Settling-aware physical search

On the saved Warrior-with-club 90° fall (`--case 5`), settling targets measured from a failure
(posture feedback plus damping, then the host) stood it in 7.19 s and raised the screen to 3/16.
A rollout search whose terminal action is that settling controller found no recovery alone; its
best prefix reached height 0.937 and root-up 0.913 at 5.51 s. Blending the settling target 60 % to
that reached posture (gain 28, damping 0.625) after 648 replayed steps stands it in **6.033 s**,
exactly replayed: 1.16 s faster, and still over 6 s.

- The library stays **3/16** (Front 7.25, side 7.04, club 6.03), none within 6 s.
- Nearby falls (88°, 92°, 58 and 62 N s) still fail at every gain tried.
- Quiet support hangs on millimetres: the centre 5.7 mm outside the inset outline and a patch
  point 3.3 µm above the floor delay it to 5.53 s. 72 settling trials found 6.025 s at best, one
  step and a handover artefact.

## Other bodies

- **Retargeting** a reference by bind angles, limits and height ratio
  (`research/stand-up-retarget-reference.mjs`) to the Warrior with the club and the Rogue: 150
  trials, none stand. The club Warrior reaches loaded two-foot standing but never goes quiet
  (segments at 0.13 to 0.16 m/s).
- **The Rogue**, empty-handed, 90°: guidance searches, longer action blocks, contact-wrench
  allocation with a muscle-effort cost (`research/stand-up-contact-policy.mjs`,
  `research/stand-up-contact-effort.mjs`), IK foot targets, sequenced placement, hand replanting,
  frame feedback and centre transfer, several hundred trials, none stand. The best partial states:
  an upright kneel (root-up 0.97, 4.0 s), a loaded left foot (275 N at 7.93 s), a centre transfer
  at 9.88 s that the right foot cannot follow. The contact solve asked 1,128 N up where momentum
  gave 562, and 270 N m of lumbar torque where the muscle gave 38.

## Foot placement and support transfer

Every route stalls at the same transition. What was found:

- **A held feet-up kneel** keeps both hands and a shin (height 0.40 m) but has no way on; the
  owner rejected it as inhuman, and the branch is closed: a foot is planted under the body, loaded,
  then the hips and knees extend.
- **Feet first from the fall** load both soles by 1.6 s while the trunk bears 282 N and the pelvis
  stays inverted (pelvis-up -0.76).
- **A bilateral extension** into hand-and-foot support holds in 36 of 36 trials (2.55 s; feet 174
  and 216 N, hands 200 and 232 N, centre 0.56 m up): a pike with the feet 0.66 m from the centre.
  Shifting the weight moves the centre 0.107 m of a 0.15 m request; every rise from it unloads the
  feet.
- **Carrying a foot under the body** with the hands bearing ends 0.21 to 0.34 m from its target:
  the knee sits at its extension stop and the ankle at its dorsiflexion limit against the targets,
  and of 204 carry steps 123 have self-contact and 109 a limit arrival.
- **Feasible endpoints have no feasible path.** One valid endpoint was found for the outward
  placement; every continuous path to it fails at the first or second waypoint, and 33 rear-foot
  endpoint searches fail floor or self clearance.
- **The predictors miss.** With no self-contact the coupled predictor errs by 3.3 m/s² and
  30 rad/s²; using the measured motor torque instead of the bounded request cuts a foot-carry miss
  from 23 to 0.6 m/s².
- **Proxies mislead.** Orientation gains, solver acceptance and search scores rose while the
  centre fell to 0.18 to 0.23 m.

## In the game

Research rise plays the library on the live body through the muscles; nothing is restored or
replayed. After two 60 N s gusts the empty-handed Warrior stands Front, Right, Back and Left in
13.0, 6.6, 34.9 and 32.1 s, retrying after kneel-and-topple: the soles are tipped (sole-up -0.29,
-0.40) while the reference phase runs on. Retry rules each regress a direction. Two measured
motions for the unshod Warrior (`assets/research/research-rise-unshod-warrior.json`, built by
`scripts/bundle-research-rise.mjs`) take Left to 6.40 s and -92° to 6.28 s; none is within 6 s.

## Assisted recovery and learned controllers

A separate experiment, which cannot meet the unassisted target (AGENTS.md):

- **Assisted rise** at Balance 100, rigid feet, the SIMBICON host: 62 of 64 directional falls
  within 6 s, 116 of 128 lying starts, 10 of 16 repeated falls, medians 5.0 to 5.3 s; at a
  Balance of 0, 10, 25 or 50 it stands none of 16. It is not in the tree.
- **A published get-up controller** (`tianxintao/get_up_control`, no licence, run locally) stands
  in MuJoCo once its teacher power is 0.6634; **SAC on Rapier** (`research/stand-up-train.py`)
  directly on the muscles stands nothing in 15 minutes, and as a residual over feedback reaches 61
  of 64 at Balance 100, no better than the feedback alone, so the browser runs no weights.

## Defects found on the way

- **Stale stance torque at handover.** The compliant-sole filter averaged a leg torque with the
  value left from before the stance was released, reversing four leg commands. The stance reset
  clears it (`src/core/control/stance.ts`, `tests/core-stance-handover.test.mjs`); the
  `supportRecovery` witness went from 15.56 to 14.88 s.
- **Research instruments.** Joint limits had bind angles subtracted twice; a tilted sole's centre
  was placed on the floor with an edge below it and box dimensions rotated twice; the heading was
  read off a near-vertical axis; a reference was captured after the fall; angle rates were taken
  for muscle-axis rates; research gravity was 9.81. Each was fixed and the runs on it discarded.
- **Support** read as foot corners within 1 mm of the lowest drops loaded corners of a tilted
  foot; support is the loaded, penetrating Rapier patch points.

## Reproduction

```powershell
node research/stand-up-replay.mjs --out .review/stand-up-replay
node research/stand-up-ik.mjs --checkpoint .review/stand-up-replay/<identity>.checkpoint --out .review/stand-up-ik.json
node research/stand-up-feedback.mjs --mode record --seed research/stand-up-feedback-seed.json --output .review/stand-up/feedback-witness.trace --seconds 35
node research/stand-up-mirror-reference.mjs <extracted-path.json.gz> <output.json.gz>
node research/stand-up-retarget-reference.mjs <source-reference.json.gz> <target-case-index> <output.json.gz>
node research/stand-up-acceptance.mjs --candidate <absolute path to a policy module> --output <report.json>
```

A policy module (`research/stand-up-{path,library,response,prefix-response}-policy.mjs`) reads its
configuration from `STAND_UP_PATH_CONFIG`, `STAND_UP_LIBRARY_CONFIG`, `STAND_UP_RESPONSE_CONFIG`
or `STAND_UP_PREFIX_RESPONSE_CONFIG`. The acceptance run refuses another HEAD or local edits; run it
in a detached checkout of `stand-up-acceptance-v1`. The keys in
`research/stand-up-path-results.json` for the sections above include `oppositeSideReflection`,
`settlingAwareSearch`, `clubSettling`, `bodyReferenceTransfer`, `bilateralFootSupport`,
`footCarryPrediction`, `liveWarriorGuidance` and `stanceTorqueReset`.

## Open choices

- **Keep Research rise selectable**, or retire it with the staged rise once a general controller
  stands the target ([roadmap](../roadmap.md)).
- **The next component**, if this line goes on: a coordinated pelvis, trunk and foot transition
  under hand support, found and checked for clearance along its whole path, then the weight carried
  onto the planted foot.
