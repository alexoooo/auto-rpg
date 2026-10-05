# Shared-bar return posture

The bar reference remembers the legal joint angles measured when both physical grips are
captured. During return, shoulder, elbow and wrist posture objectives use those angles.
The item's position remains the primary objective; its orientation remains free after release.
The trunk and legs retain their original objectives. This changes no anatomy, strength,
assistance, task tolerance, capture rule, swing path or release operation.

This avoids asking an arm to return simultaneously to the bar's capture location and a
reference joint pose that may conflict with it. It is a policy choice, not a body requirement.
The pose is explicit replayable state, and task observations return a detached copy.
The task configuration records protocol 4 and `returnPosture: captured-arm-angles`.

## Development comparison

[The complete records](bar-posture.json) contain four frozen common-runner archives.
Harness: Node 24.19.0, core world, Rapier 0.21.0-auto-rpg.5 / adapter 6, 120 Hz, directional
actuation, ordinary ground and zero root/weapon assistance. Each run covers Warrior, Rogue
and skeleton, either release hand, development seeds 0 and 1: twelve trials per configuration.
The unchanged gate observes completion within twelve seconds, a 3 cm movement/return tolerance,
physical obstacle contact, continuous release, attachment error, support forces and replay.

| Limit profile / body | Largest return error before (mm) | After (mm) |
|---|---:|---:|
| Gameplay reference / Warrior | 11.259 | 1.646 |
| Gameplay reference / Rogue | 6.624 | 3.090 |
| Gameplay reference / skeleton | 26.083 | 10.700 |
| Measured-angle correction / Warrior | 29.975 | 1.646 |
| Measured-angle correction / Rogue | 6.659 | 10.600 |
| Measured-angle correction / skeleton | 28.512 | 9.997 |

All four screens pass 12/12; all trials remain upright and replay exactly. Movement before
return is unchanged. The largest shared-movement errors remain 27.523 mm on the reference and
27.961 mm on corrected limits. The corrected-profile Rogue's worst return becomes less accurate,
while remaining within the original gate. This is a small development comparison, not a
held-out reliability estimate or evidence that every metric improves. Other corrected-limit
controller regressions remain in [the limit record](joint-limits.md).

The two after runs use the identical source content
`c23dc5c075f2503de0573a033a21bb27db0da701058355c5eb3a6ab549a6cb80`.
The before-reference archive differs from before-coordinate only in the runner's profile
acceptance and revision metadata. Before-coordinate and after-reference differ only in
`src/core/tasks/bar.ts`. Per-run archive and manifest hashes are in the JSON record.

The common CLI accepts either pinned Rapier profile through `CORE_ENGINE` and records the
engine revision alongside the package identity. A CLI test verifies that its physical workers
use that revision and replay the shared-item release.

```powershell
$env:CORE_ENGINE = 'rapier'
node research/control-foundation.mjs --suite bar --split development --support standing --actuation directional --samples 2 --workers 3
$env:CORE_ENGINE = 'rapier-coordinate'
node research/control-foundation.mjs --suite bar --split development --support standing --actuation directional --samples 2 --workers 3
Remove-Item Env:CORE_ENGINE
```

## Readiness disturbance

The readiness regression uses the same Node stand, reference Rapier profile and 120 Hz. The
skeleton's right-release seed-1 trial receives a +x impulse at the item's centre of mass,
875 steps after capture. Readiness is inspected at capture + 901 steps. The captured posture
keeps the former 2 N s disturbance inside the task's 3 cm tolerance, so it cannot distinguish
readiness from a timer-only completion rule. The synthetic test uses 4 N s, selected from:

| Impulse (N s) | Peak return error (mm) | Complete at the inspection? | Recovered by twelve seconds? |
|---|---:|---|---|
| 2 | 21.916 | Yes; still ready | Yes |
| 4 | 46.185 | No | Yes, at step 1064 |
| 6 | 69.776 | No | Yes, at step 1086 |

At 4 N s the body stays upright and completes after thirty consecutive ready steps, at a
10.066 mm return error. Replacing measured readiness with time alone fails this test.
A separate test saves before capture, checks the observed legal pose and detached readings,
and replays capture and return. Disabling the captured posture fails its physical return check.
These disturbances test the completion rule, not anatomical strength or a gameplay shove budget.

## Browser check

[Three visible built-page trials](bar-posture-browser.json) cover Warrior/right release on
the gameplay reference, skeleton/right and Rogue/left on corrected limits, all at development
seed 0. Initial and returned poses were inspected. Each browser replay matches itself and
Node's full post-checkpoint observation hash and complete task outcome. The checkpoint is
step 240; completion is at steps 1001, 1015 and 995 respectively. Browser logs contain no
warnings or errors. This verifies these shared builders and saved posture in both runtimes;
it does not extend the task to recovery or combat.
