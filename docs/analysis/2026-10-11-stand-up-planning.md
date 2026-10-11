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

## Reproduction and next decision

From the repository root, choose output destinations that do not yet exist:

```powershell
node research/stand-up-replay.mjs --out .review/stand-up-replay
# Use the placement checkpoint listed in replay.json:
node research/stand-up-ik.mjs --checkpoint .review/stand-up-replay/<identity>.checkpoint --out .review/stand-up-ik.json
node research/stand-up-contact.mjs --out .review/stand-up-contact.json
node --test tests/research-stand-up-planning.test.mjs tests/research-stand-up-contact.test.mjs
```

The next decision is a support sequence, rather than more freedoms in the same endpoint solve.
Release and reposition the appropriate hand, or execute a side-sitting transition, before
bringing the boot through. A candidate must first connect the actual fall to the demonstrated
supported half-kneel through bounded muscle execution. Then preserve its contact gates while
shortening it and testing changed falls, occupied hands, repeated falls and disturbances.
The existing half-kneel extension remains a separate component witness. Full timing and
qualification stay pending until this connection executes.
