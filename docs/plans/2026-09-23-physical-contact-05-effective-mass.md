# Physical contact 05: effective mass

## Why

A blow is worth ½·μ·v², where μ is the reduced mass of striker and struck part. The striker's mass
today is a number each terminal declares (`impactMassKg`):

- 1.30 kg for the blade, and `kg(8)` for the fist;
- 0.35 kg for a human fist, whose hand body is 1.1;
- the ram's `kg(74)`, which is hand-authored as "I/d^2 plus a hinge-mass of trunk".

The arm behind a blow is never counted. In a real strike, what the target feels is the effective
mass at the contact point: the item plus the share of the chain behind it that is coupled at that
instant. That is also where a giant's size and weight belong.

## Changes

1. **A general effective-mass function.**
   - A new module, `src/golem/effective-mass.ts`, pure and loadable in Node.
   - It computes the operational-space mass of a serial chain at a contact point along the contact
     normal: `m_eff = 1 / (n^T J M^-1 J^T n)`, the chain's inverse inertia seen from the point.
   - It works from each part's mass, centre and a principal inertia derived from its geometry. It
     does not use Havok's floored inertias (`jointInertiaFloor`, `castToCarried`,
     `inertiaFloor`), which are solver conditioning rather than body.
   - The joints are free at the instant of impact, which is the honest reading, because a motor
     cannot respond inside a contact.
   - The chain runs from the struck point back through the terminal, the links (`BuiltChain.parts`,
     ordered from the socket outward) and the mount, to the trunk.
   - **The trunk is a free-floating base carrying the body's whole supported mass and inertia, never
     the keyframed carrier.** Walking to a keyframed trunk makes it infinitely heavy, and a
     thrust along a fully extended arm then reads as unbounded. With a floating base, m_eff is at
     most the whole body, which is the physical ceiling. Pin that ceiling with a test at full
     extension.
   - **The struck side goes through the same function.** Its m_eff at the contact point, walked
     from the struck part to its own floating base, replaces the struck part's bare mass in the
     reduced mass. Session 06 then reads the same pair of figures. One contact, one model.
2. **It replaces every declared `impactMassKg`.**
   - Blade, fist, mace, maul, whip weight and beads, plate, the `none` chain's cap, the ram and the
     human fist.
   - `Combat` asks the striker for m_eff at the contact point and normal, and `impactEnergyJ` takes
     it.
   - The ram stops being a special case: its plate, neck and trunk are just the chain behind its
     point.
   - `withWeight` and `withSize` then reach blows with no striker-specific rule, and the
     `impactMassKg` scaling assertions in `tests/attributes.test.mjs` become assertions about the
     chain.
3. **Validate against 01's ground truth.**
   - `tests/harness/impact-bench.mjs` again.
   - The computed m_eff per striker is within a stated tolerance of the implied one, at x1 and at
     `max`.
   - If a striker disagrees, fix the model, not the tolerance. A disagreement means the chain was
     walked wrongly or the coupling assumption is wrong.
4. **Recalibrate the energy prices.**
   - `cutJoulesPerDamage`, `chopJoulesPerDamage`, the blunt and point rows, and the floors are set so
     x1 damage a bout stays at 01's value.
   - The price is per joule. What moves is how many joules arrive.
   - Re-read the `tests/scoring.test.mjs` tables that pin the reduced-mass arithmetic, and update
     their numbers with the arithmetic beside them.

## Measure

- The impact bench, and x1 against x1 either side with the fingerprint diff.
- The idle-dummy matrix from 01.
- The damage-per-blow distribution, not only its mean. The price per joule holds the mean. A tail of
  huge blows from near-extended thrusts means the base or the chain walk is wrong.
- The giant preset against x1 (192 blocks). The giant's damage per wounding blow should now exceed
  the default's.
