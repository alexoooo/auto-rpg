# Physical contact 08: general stability

## Why

How hard a body is to knock over is a set of per-family constants today:

- **Brace capacity:** 1.5 for the biped, 2.0 for the skeleton, 2.6 for the multileg, and 1.0 for the
  wheel.
- **Gait scale curves:** per family.
- **The `Knockdown` table:** settle speed, rest, lying cap and rise peak, set on the skeleton only.
- **Separate posture predicates:** `fighterPostureIsSupported` and `constructPostureIsSupported`.

The owner wants general unit physics.

## Changes

1. **Tipping capacity from the body.**
   - A standing body tips when its centre of mass is carried past its base of support. The impulse
     that does that is `M * sqrt(2 * g * dh)`, where dh is the rise of the centre of mass as it rolls
     over the base's edge. That comes from the footprint radius and the centre-of-mass height.
   - Moving and crouching change the base and the height. That replaces the gait curves.
   - The capacity multiplies by the stability attribute, as today.
   - Derive the base from each locomotion module's footprint, and the height from the live mass
     distribution.
2. **One knockdown table for every body.** Settle, rest, lying cap and rise peak, with the rise peak
   and times scaled by size and recovery as today.
   - Stone, human, wheel and multileg get the settle rule they lack. Today they rise after the dwell
     whether or not the fall has stopped.
3. **One posture predicate** for every body.
4. **Delete the per-family brace and gait numbers**, and the `Knockdown` table's per-body rows.

## Measure

- **The shove bench:** the stagger and fall impulses per family against the tipping prediction. The
  solver and the formula agree within a stated tolerance.
- **Knockdowns a bout** per family against session 06's.
- **x1 against x1 either side**, with the fingerprint diff.
- **The stability sweep** (`--stat stability`, 192 blocks). The row still moves the fall impulse.
