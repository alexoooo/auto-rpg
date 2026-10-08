# Acquiring hand-and-shin support after a fall

`control/support-entry.ts` is an optional independent pose-sequence policy hosted by
`createPolicyBody`. Its configuration supplies joint targets, timed rolling/preparation poses,
a reference frame, required and forbidden contacts, gains and retry limits. It receives detached
observations and returns ordinary bounded velocity actions. No physics handle, root force,
contact solver or fighter state reaches the policy. Other policies need not use its stages.

`tasks/support-entry.ts` supplies a physical fall and scores measured support independently.
`supportEntryReading` is the shared orientation/contact predicate. It rejects head/trunk support
even when all desired joint angles or hand/shin contacts have been reached. Entry begins from
the actual fallen body; it does not require the support it is trying to restore.

## Fixture and acceptance

`SUPPORT_ENTRY` in `src/core/mind/rise/support-recovery.ts` owns the shared acquisition
settings below. `supportEntryPolicy` constructs the research task's acquisition policy;
fall and acceptance settings remain in the fixture. Arena recovery instead uses the reference
riser with a measured standing handover ([record](recovery-cycle.md)). Acquiring this research
pose does not yet provide a reliable transition into standing.

Harness: Node core world and visible `/control-tasks.html`, 120 Hz, Rapier
0.21.0-auto-rpg.6 / adapter 7, corrected angular limits, directional muscle bounds, native
16 solver iterations, empty-handed Warrior, zero root and weapon assistance. Anatomical strength
is unchanged. Patch and per-point friction are separately identified configurations.

`SETTINGS` defines a 20 by 1 by 20 m floor centred at `(0, -0.5, 0)` m. The existing fighter
stands for one second, receives a horizontal impulse at the middle trunk of 1.5 N s per kg
of total body mass, and runs until its fall bar is crossed or three seconds elapse. The task
then disposes that controller and gives the unchanged body to the independent policy.
Four fixed development directions are forward, right, backward and left (world +z, +x, -z, -x).
They are exact axis vectors. This floor and bootstrap differ from the older arena fall study;
its figures do not transfer to this fixture.

The policy waits for all segment centre velocities below 0.1 m/s for 0.5 s, with a three-second
settling timeout. Pelvis forward y below -0.5 identifies front; above 0.5 identifies back;
the reference left axis identifies the remaining side. Rotations are normalized for this
reading. The existing `RISE.roll` poses turn a non-front body, followed by another settling
wait. The first three `RISE.rise` poses (fold, tuck, prop) prepare support. Their anatomical
targets are converted through each freedom's bind angle and clamped to its limits.
The final joint targets come from the installed all-fours witness in
[posture hold](posture-hold.md). All active stages use full activation, a 0.01 s response and
10 rad/s speed cap, without changing muscle ceilings. An unsupported final pose retries
after six seconds. These gains are development choices measured here and in the
recovery study (`docs/analysis/2026-10-05-recovery-support.md@7f3ebcdb`).

Acceptance requires a real initial fall, pelvis facing down, positive fixed-ground contact
on both hands and both shins, and no positive contact on head or any trunk segment. After
two continuous seconds of this support with all segment centres slower than 0.1 m/s, the
task captures segment origins. It then requires ten uninterrupted seconds of support with
maximum drift no greater than 2 cm, zero assistance and directional delivered-effort excess
no greater than 0.0001 N m. The forty-second watch begins **after** the physical bootstrap.
Late acquisition, excess drift and support loss remain failures. These are development
task criteria, not standing or useful-control handover criteria.

## Measurements

Node core world, 120 Hz. Acquisition time starts after the fall bootstrap. Drift is measured
from the first accepted quiet-support frame and includes every subsequent step.

| Friction | Shove | Acquisition (s) | Hold observed (s) | Maximum drift (m) | Pass |
|---|---|---:|---:|---:|---|
| Patch | Forward | 31.0500 | 8.9500 | 0.041564 | No |
| Patch | Right | 13.0917 | 10 | 0.016813 | Yes |
| Patch | Backward | 13.3000 | 10 | 0.038507 | No |
| Patch | Left | 13.1750 | 10 | 0.019354 | Yes |
| Per-point | Forward | 14.4333 | 10 | 0.014747 | Yes |
| Per-point | Right | 31.4333 | 8.5667 | 0.053114 | No |
| Per-point | Backward | 13.5167 | 10 | 0.004385 | Yes |
| Per-point | Left | 13.3333 | 10 | 0.016067 | Yes |

All eight acquire support and replay exactly from two seconds after bootstrap. Five pass
the full hold gate. Maximum measured effort excess stays below 0.0001 N m in all eight.
Each profile also reports eight unsupported Rogue/skeleton cells. These selected directions
are not a distributional recovery estimate; held-out data remains unused. The skeleton's
anatomy remains a placeholder. Full manifests, configurations, traces and results are in
[support-entry.json](support-entry.json).

Visible browser trials reproduce the complete Node outcome and replay trace from the
two-second checkpoint, including the failing cell:

| Profile / direction | Observation SHA256 |
|---|---|
| Per-point / forward | `ab63e7a9b34bf2537be0a41c5604934bbdddd917d0b66a024aae5d2deae53a85` |
| Per-point / right | `2670054a185205aa5f8c66e0bb1a560f112b552ac48a2a5bda44bc075f48be04` |
| Patch / right | `f52683849119f7469c97c368cef3377a9235d703963a9dd9fdba252176f3f8ba` |

The predicate test fails when forbidden head/trunk contacts are ignored. Physical tests
cover all four per-point directions, a passing patch-friction direction, exact checkpoint
replay and the failed cell's full forty-second watch through the worker runner.

Reproduce with `CORE_ENGINE=rapier-coordinate` or `rapier-coordinate-coulomb`:

```powershell
node research/control-foundation.mjs --suite support-entry --split development --actuation directional --workers 2
```

The common runner measures its watch relative to the task's initial world clock, preserving
bootstrap time in observations and snapshots. It refuses joint-stop prediction settings for
this direct policy. Parallel timings are diagnostic, not a quiet-machine capacity figure.

Generalization to other falls, loads and bodies remains open. The next physical gate is moving
the centre and releasing hand support while retaining balance. Replaying the old timed kneel
poses after the demonstrated hold still collapses; faster joint feedback alone does not fix it.
