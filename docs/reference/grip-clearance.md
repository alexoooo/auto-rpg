# Grip clearance and continuous collision filtering

How the Rapier adapter keeps a grip's two shapes from colliding, during the grip and after its
release until they are clear, for discrete contacts and CCD alike; and the vendored flag
(`FILTER_CCD_PAIRS`, package `.3`) that makes CCD obey it.

## The rule

- Anatomical joint partners and attached grip partners do not collide. A release removes the fixed
  joint without touching either body's pose, mass or velocity.
- If the two shapes still overlap, their pair stays excluded until every collider pair has positive
  separation, read by `Collider.contactCollider` at prediction distance zero before each step. No
  timer, no extra force, and absence of admitted contacts is not taken for clearance. Once clear,
  the former hand can hit the item; other bodies keep their rules throughout.
- `EngineGrip.collisionSuppressed` and the equipment observation expose it. The snapshot stores
  release exclusions with grip handles and node poses, so a restored overlapping release separates
  and strikes as before.

The capsule hand is an open-hand shape while the grasp frame closes the fingers about the haft, so a
grip overlaps by construction. In the reference pose (`tests/fixtures/shapes.mjs`, the `armed`
placement):

| Body | Hand/club minimum gap, either hand, m | Closest other segment | Gap, m |
|---|---:|---|---:|
| Warrior | -0.023048 | Same-side forearm | 0.088572 |
| Rogue | -0.019314 | Same-side forearm | 0.070181 |
| Skeleton | 0 | Same-side forearm | 0.070920 |

## Pinned Rapier behaviour

In `.2`'s native `dynamics/ccd/sweeps.rs` the continuous sweep checks collision groups and
`filter_contact_pair` hooks but not impulse-joint contact exclusions, and the TypeScript
`PhysicsPipeline.step` supplies hooks only with an event queue, so the adapter owns one auto-cleared
queue. `FILTER_CCD_PAIRS` (bit 8) enables the contact-pair callback during sweeps alone, keeping
ordinary contact generation and recycling. Joint partners use it; separate items also enable
ordinary pair filtering for the release interval. Callbacks read JavaScript pair membership and
never reenter WASM.

## Measurement

Node core world, Rapier `0.21.0-auto-rpg.3`, adapter 3, 120 Hz, no gravity or assists, directional
configuration; `node --test tests/core-grip-clearance.test.mjs tests/core-equipment.test.mjs`.

- Two 1 kg spheres (radii 0.1/0.05 m) start 0.02 m apart in a rigid grip at 1 m/s. Release keeps
  their velocities exactly and relative position within 1e-6 m through the next step; a 1 N s
  impulse parts them, a later -2 N s brings them back into contact, with CCD on or off, and the
  branch replays from a saved overlapping release. Without the exclusion the next step resolves the
  overlap.
- A bar at 80 rad/s about a fixed parent's hinge sweeps a thin box on that parent: with the pair
  excluded the five-step trace is bit-identical to no box; the same box as a separate obstacle
  changes it. Without the flag, the connected box clamps the second step's sweep.
- The native `ccd_default_vs_fixed` tests: the flag rejects a fast sweep, and a settling box's
  240-step ordinary-contact trace is identical with it on and off.

Adapter cost (`node research/engine-adapter-cost.mjs --reference 1ac3dc23 --runs 3`: Node 24.19.0,
arena core world, 120 Hz, Warrior/Rogue, symmetric, 12 s cap, alternating pairs on a quiet machine;
pose digest `e71c657a6924a58c` in all bouts):

| Pair | Previous step, ms | Current step, ms | Previous solver, ms | Current solver, ms |
|---|---:|---:|---:|---:|
| 1 | 0.936856 | 0.969619 | 0.518924 | 0.534850 |
| 2 | 0.917682 | 0.914777 | 0.523444 | 0.519169 |
| 3 | 0.940676 | 0.910588 | 0.535209 | 0.520290 |

No consistent slowdown.

## Tried and not kept

- Ordinary contact hooks on every body: they disable Rapier's contact recycling and change existing
  trajectories.
