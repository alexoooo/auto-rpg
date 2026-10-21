# Shared-bar return posture

The standing shared-bar fixture (`src/core/tasks/bar.ts`, protocol 4, `returnPosture:
captured-arm-angles`) remembers the legal joint angles measured when both grips are captured, and
its return asks the shoulders, elbows and wrists for those angles. The item's position stays the
primary objective and its orientation is free after release; trunk and legs keep their objectives.
This is a policy choice: it stops the arm being asked for a capture location and a reference joint
pose that may conflict. Anatomy, strength, assistance, tolerances, capture, swing and release are
unchanged. The pose is replayable state; observations return a detached copy.
`tests/core-bar.test.mjs@2a1b29ac` reads the readiness disturbance below.

## Development comparison

Harness: Node 24.19.0, core world, Rapier 0.21.0-auto-rpg.5 / adapter 6, 120 Hz, directional
actuation, ordinary ground, zero root and weapon assistance. Warrior, Rogue and skeleton, either
release hand, development seeds 0 and 1: twelve trials per configuration. The gate is unchanged:
completion within 12 s, 3 cm movement and return tolerance, obstacle contact, continuous release,
attachment error, support forces and replay.

| Limit profile / body | Largest return error before (mm) | After (mm) |
|---|---:|---:|
| Gameplay reference / Warrior | 11.259 | 1.646 |
| Gameplay reference / Rogue | 6.624 | 3.090 |
| Gameplay reference / skeleton | 26.083 | 10.700 |
| Measured-angle correction / Warrior | 29.975 | 1.646 |
| Measured-angle correction / Rogue | 6.659 | 10.600 |
| Measured-angle correction / skeleton | 28.512 | 9.997 |

All four runs pass 12/12, stay upright and replay exactly; movement before return is unchanged
(largest shared-movement error 27.523 mm reference, 27.961 mm corrected). The corrected-profile
Rogue's worst return gets worse while staying inside the gate. Other corrected-limit regressions
are in [the limit record](joint-limits.md).

The two after runs share source content
`c23dc5c075f2503de0573a033a21bb27db0da701058355c5eb3a6ab549a6cb80`; before-coordinate and
after-reference differ only in `src/core/tasks/bar.ts`. Per-run archive and manifest hashes are in
[bar-posture.json](bar-posture.json).

```powershell
$env:CORE_ENGINE = 'rapier'   # then 'rapier-coordinate'
node research/control-foundation.mjs --suite bar --split development --support standing --actuation directional --samples 2 --workers 3
Remove-Item Env:CORE_ENGINE
```

## Readiness disturbance

The readiness disturbance is a 4 N s impulse. Same Node stand, reference profile, 120 Hz: the
skeleton's right-release seed-1 trial is struck +x at the item's centre of mass 875 steps after
capture and inspected at capture + 901 steps. 2 N s stays inside the 3 cm tolerance, so it cannot
tell measured readiness from a timer.

| Impulse (N s) | Peak return error (mm) | Complete at the inspection? | Recovered by twelve seconds? |
|---|---:|---|---|
| 2 | 21.916 | Yes; still ready | Yes |
| 4 | 46.185 | No | Yes, at step 1064 |
| 6 | 69.776 | No | Yes, at step 1086 |

At 4 N s the body stays upright and completes after thirty consecutive ready steps at 10.066 mm.
These impulses test the completion rule, not strength or a shove budget.

## Browser check

[Three built-page trials](bar-posture-browser.json) at development seed 0 (Warrior/right on the
reference profile; skeleton/right and Rogue/left on corrected limits) match Node's post-checkpoint
observation hash and task outcome, and replay themselves. Checkpoint step 240; completion at steps
1001, 1015 and 995. No browser warnings or errors.
