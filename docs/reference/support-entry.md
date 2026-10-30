# Acquiring hand-and-shin support after a fall

The research task that fells a body and has an independent policy acquire and hold hand-and-shin
support: `tasks/support-entry.ts` (its `SETTINGS`) and the acquisition settings `SUPPORT_ENTRY`
(`src/core/recovery/rise/support-recovery.ts`), both read from [Fixture and
acceptance](#fixture-and-acceptance). Arena recovery uses the reference riser with a measured
standing handover instead ([recovery cycle](recovery-cycle.md)).

`control/whole-body/support-entry.ts` is an optional pose-sequence policy hosted by `createPolicyBody`: joint
targets, timed rolling and preparation poses, a reference frame, required and forbidden contacts,
gains and retry limits; detached observations in, bounded velocity actions out. The task scores
support independently through `supportEntryReading`, which rejects head or trunk support whatever
the joint angles. Entry starts from the fallen body as it lies.

## Fixture and acceptance

Harness: Node core world and visible `/control-tasks.html`, 120 Hz, Rapier 0.21.0-auto-rpg.6 /
adapter 7, corrected angular limits, directional bounds, 16 solver iterations, empty-handed
Warrior, zero assistance. Patch and per-point friction are separate configurations. These are
development task choices, not standing or handover criteria.

**The fall** (`SETTINGS`). A 20 by 1 by 20 m floor centred at `(0, -0.5, 0)` m. The fighter stands
`standSeconds` 1 s, takes a horizontal impulse at the middle trunk of `impulsePerMass` 1.5 N s per
kg of body mass, and runs until its fall bar is crossed or `fallSeconds` 3 s pass; the task then
hands the body to the policy. Development directions are exact axes: forward, right, backward,
left (world +z, +x, -z, -x).

**The acquisition** (`SUPPORT_ENTRY`, also used by `supportEntryPolicy`):

| Field | Value | Meaning |
|---|---:|---|
| `slow`, `stillSeconds` | 0.1 m/s, 0.5 s | settled: every segment centre slower than this, for this long |
| `settleLimit` | 3 s | settling timeout |
| `facing` | 0.5 | pelvis forward y below -0.5 is front, above 0.5 back; else the reference left axis gives the side |
| `response`, `speed` | 0.01 s, 10 rad/s | every stage's joint response and speed cap, full activation |
| `holdLimit` | 6 s | an unsupported final pose retries after this |
| `required` / `forbidden` | hands and shanks / head and trunk segments | the contacts that count |

`RISE.roll` poses turn a non-front body, then it settles again; the first three `RISE.rise` poses
(fold, tuck, prop) prepare support, converted through each freedom's bind angle and clamped. The
final targets are the installed all-fours witness of [posture hold](posture-hold.md). The gains
were chosen in the recovery study (`docs/analysis/2026-10-05-recovery-support.md@7f3ebcdb`).

**Acceptance** (`SETTINGS`). A real fall; pelvis facing down; positive fixed-ground contact on both
hands and both shins and none on head or trunk. After `acquireSeconds` 2 s of that support with
every segment slower than 0.1 m/s, segment origins are captured; then `continueSeconds` 10 s of
unbroken support with drift at most `tolerance` 0.02 m, zero assistance and effort excess at most
`effortTolerance` 0.0001 N m. The `seconds` 40 s watch starts after the fall; late acquisition,
drift and lost support fail.

## Measurements

Node core world, 120 Hz. Acquisition time starts after the fall; drift is from the first accepted
quiet-support frame through every later step.

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

All eight acquire support and replay exactly from two seconds after the fall; five pass the hold.
Effort excess stays below 0.0001 N m. Rogue and skeleton cells are reported unsupported. Manifests,
configurations, traces and results: [support-entry.json](support-entry.json).

Visible browser trials reproduce the Node outcome and replay trace from the two-second checkpoint,
the failing cell included:

| Profile / direction | Observation SHA256 |
|---|---|
| Per-point / forward | `ab63e7a9b34bf2537be0a41c5604934bbdddd917d0b66a024aae5d2deae53a85` |
| Per-point / right | `2670054a185205aa5f8c66e0bb1a560f112b552ac48a2a5bda44bc075f48be04` |
| Patch / right | `f52683849119f7469c97c368cef3377a9235d703963a9dd9fdba252176f3f8ba` |

```powershell
# CORE_ENGINE=rapier-coordinate or rapier-coordinate-coulomb
node research/control-foundation.mjs --suite support-entry --split development --actuation directional --workers 2
```

The runner times its watch from the task's initial clock, keeping the fall in observations and
snapshots, and refuses joint-stop prediction for this policy. The predicate test fails if forbidden
contacts are ignored; physical tests cover the four per-point directions, a passing patch direction,
checkpoint replay and the failed cell's full watch.

## Tried and not kept

- Replaying the old timed kneel poses after the demonstrated hold: the body still collapses; faster
  joint feedback alone does not fix it.
