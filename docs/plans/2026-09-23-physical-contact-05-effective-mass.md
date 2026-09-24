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

## Inputs from session 01

- **The ground truth is the stroke's implied plastic mass for strokes that contact for 2 to 9
  substeps.** At x1, the wrist blade reads 1.45 kg, the mace 3.67, the maul 7.18 and the pitch
  blade 1.14. At max: blade 4.17, mace 7.55, maul 9.29. Those are 90 kg sphere figures from the
  Node impact bench.
- **Strokes that contact for 11 or more substeps are pushes**, and their implied mass includes the
  drive. The model leaves the drive out by design, so they are not a target. They are the wrist fist,
  the max plate, the max human fist and the skeletal blade, which contacts for 15 substeps with a
  restitution of -0.8.
- **The bench's tap uses a keyframed stand base**, so its along-the-arm reading goes to `inf` on a
  straight chain. The model's floating base is the thing that bounds it. Compare the model against
  the tap's edge column, and against the stroke. Compare it against the tap's axis column only where
  that column is finite.

## What landed, 2026-09-24

Every figure is in `docs/analysis/2026-09-23-attribute-measurements.md` "Physical contact 05:
effective mass", with its harness. What differs from the plan above:

- **A bug came first (0e2dee5).** `RigidStrike.velocityAt` read the angular term from the
  geometric centre, while Havok's linear velocity belongs to the centre of mass. A tap on a mace's
  edge read 0.875 kg where the rigid-body formula gives 1.07. The mace and the maul moved; nothing
  else did.
- **The model is two files, not one (4acc9e3).**
  - `src/golem/effective-mass.ts` is the pure mechanics.
  - `src/body-inertia.ts` walks a live body, from the joints `src/rig.ts` now records, back to a
    free-floating base that carries the rest of the body.
  - The walk is general, so the human and the ram need no rule of their own.
- **It reads the solver's inertia, floors and all, and not each part's solid.** The plan said
  otherwise. The stroke overruled it: through the parts' own solids, a max wrist blade reads no
  heavier than an x1 one, where the stroke gives up 3.41 kg against 1.47. Havok reports that
  inertia per kilogram of the body's mass, which is now a trap in `AGENTS.md`.
- **Validation.**
  - The walk is within 5 % of the edge tap.
  - It is within about a quarter of every stroke.
  - The one coupling it leaves out is a joint resting on its stop.
- **`Combat` reads both masses at the contact along the contact normal (16108d3).**
  - Every `impactMassKg` is gone.
  - The size and weight tests now pin the effective mass: never lower, and higher behind a ram or
    a capped socket.
- **The prices hold x1 pace, not damage per bout**, since the vitality bar binds the latter.
  - Edge rises x1.783, anchored on the default build.
  - Blunt rises x3.786, pooled over default, mace and maul.
  - Floors move with their prices, chop takes the edge's factor, and the point floor stays.
  - The Warrior fixtures in `tests/scoring.test.mjs` now strike with a stone arm behind them, so
    every anchor holds to its digit.
- **One price across bodies moves what couples differently**, and it was accepted:
  - the maul x1.40, fists x1.37, the skeleton's blade x1.53;
  - the mace x0.69, the whip x0.50, the human's blade x0.51;
  - the ram x0.20: its lunge on a free post is now a shove;
  - the capped socket's shove x40.

  Each is on session 10's lists.
- **Four fixtures moved and no assertion did.**
  - The ram's lunge test now pins the shove.
  - The human wound test and the two worker-count tests take the seeds their documented searches now
    pick.
- **Stone's x1 control is back in session 01's band**, knockdowns included. Session 04 had left
  those red.
- **The giant's blows now carry the giant.** Per wounding blow it deals 3.0 times the default's, and
  it wins 97.4 %. Size and weight alone went from 14.8 % to 77.6 %.
- **The skeleton loses its arms more often and falls less.** It severs 1.64 times a bout against
  1.11, and it is knocked down 3.77 times against 5.30. The skeleton is not in the band's definition,
  so this is reported.
- **The idle-dummy matrix.**
  - The giant ends an idle body outright in 79 to 100 % of bouts, against 54 to 88 %.
  - The skeleton's two outright cells went to zero, over stone (from 17 %) and the human (from 13 %).
    With the drain it still wins all of them.
  - The human is still at zero outright, and with the drain it wins less against stone (42 % from
    58 %) and against itself (21 % from 67 %). That goes to session 09 with the stand-off.
