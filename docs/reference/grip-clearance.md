# Grip clearance and continuous collision filtering

The Rapier adapter applies the same pair exclusions to discrete contacts and CCD. Anatomical
joint partners and attached grip partners do not collide. On release, the fixed joint is removed
without modifying either body's pose, mass or velocity. If the two shapes still overlap, their
collision pair stays excluded until all collider pairs have positive separation. The check uses
`Collider.contactCollider` with prediction distance zero before each world step; it does not
infer clearance from the absence of admitted contacts. There is no grace timer or extra force.

This matters for the current hand representation. It is an open-hand capsule, while the grasp
frame describes closed fingers around the haft. Geometric clearance in the reference pose,
using `tests/fixtures/shapes.mjs` and the existing `armed` placement, reads:

| Body | Hand/club minimum gap, either hand, m | Closest other segment | Gap, m |
|---|---:|---|---:|
| Warrior | -0.023048 | Same-side forearm | 0.088572 |
| Rogue | -0.019314 | Same-side forearm | 0.070181 |
| Skeleton | 0 | Same-side forearm | 0.070920 |

These are reference-pose geometric measurements, not moving-body clearance guarantees. The
grasping pair's deliberate overlap must not become a depenetration kick when the grip ends.
The former hand can hit the item again after clearance. Other hands, limbs, opponents and
obstacles retain their collision rules throughout. Disposing the grip slot removes its exclusion.

`EngineGrip.collisionSuppressed` and the equipment observation expose this condition. The
adapter-3 snapshot stores release exclusions with grip handles and node poses. Restoring an
overlapping release restores its exclusion and reproduces the subsequent separation and impact.
The fixed registered grip slots retain their identity; dynamic exclusions do not invent joints.

## Pinned Rapier behavior

In `.2`'s native `dynamics/ccd/sweeps.rs`, the continuous sweep checks collision groups and
`filter_contact_pair` hooks, but does not check impulse-joint contact exclusions. Its TypeScript
`PhysicsPipeline.step` supplies hooks only when an event queue is passed. The adapter therefore
owns one auto-cleared queue. Package `.3` adds `FILTER_CCD_PAIRS` (bit 8): it enables the
existing contact-pair callback during sweeps without changing ordinary contact generation or
recycling. Anatomical joint partners use that flag; separate items also enable ordinary pair
filtering for the release-clearance interval. Enabling ordinary hooks on every body disables
Rapier's contact recycling and changes existing trajectories, so it is not equivalent.
Callbacks read
JavaScript pair membership only; they never reenter mutable WASM state. The queue is disposed
with the world and carries no authoritative gameplay state.

## Regression fixtures

Harness: Node core world, Rapier `0.21.0-auto-rpg.3`, adapter 3, 120 Hz, no gravity or assists,
directional configuration. `tests/core-grip-clearance.test.mjs` contains both failing-before
fixtures:

- Two 1 kg spheres, radii 0.1/0.05 m, start 0.02 m apart in a rigid grip, moving together at
  1 m/s. Releasing preserves their velocities exactly and their relative position within 1e-6 m
  through the next step. A 1 N s impulse separates the item; a later -2 N s impulse sends it
  back, producing a physical contact. Both moving-body CCD settings pass, and the entire branch
  replays from a saved overlapping release. Without the clearance exclusion, the very next step
  changes their relative position to resolve the original overlap.
- A bar rotates at 80 rad/s about a fixed parent's hinge. A thin box on that parent lies in its
  swept arc. With the joint's pair excluded, the five-step pose trace is bit-identical to the
  same parent with no box. Moving that box to a separate obstacle changes the trajectory. Before
  the hook fix, the connected box incorrectly clamps the second step's sweep.

```powershell
node --test tests/core-grip-clearance.test.mjs tests/core-equipment.test.mjs
```

These fixtures establish collision semantics, not anatomical release animation, grip strength,
standing weapon control or compound splitting. Explicit CCD still needs held-weapon tests through
the complete controller path.

The native `ccd_default_vs_fixed` tests additionally verify that the new flag rejects a fast
sweep and that a settling box's 240-step ordinary-contact position/velocity trace is identical
with the flag on and off. The latter also checks that no ordinary contact calls the CCD-only hook.

## Adapter cost

`node research/engine-adapter-cost.mjs --reference 1ac3dc23 --runs 3` compares the previous
adapter and this one with the same `.3` artifact. Harness: Node 24.19.0, arena core world,
Rapier SIMD, 120 Hz, Warrior/Rogue, symmetric actuation, balance 0% on both sides, 12 s cap.
One warm-up bout per adapter precedes three alternating-order pairs on a quiet machine.
The pose digest is `e71c657a6924a58c` for all eight bouts, each 1440 steps.

| Pair | Previous step, ms | Current step, ms | Previous solver, ms | Current solver, ms |
|---|---:|---:|---:|---:|
| 1 | 0.936856 | 0.969619 | 0.518924 | 0.534850 |
| 2 | 0.917682 | 0.914777 | 0.523444 | 0.519169 |
| 3 | 0.940676 | 0.910588 | 0.535209 | 0.520290 |

These paired timings show no consistent slowdown on this fixture; they do not establish browser
capacity or the cost of many overlapping released grips. Trace hashing is outside timed steps.
