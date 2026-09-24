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
   - **It applies while rising too.** A rising body's capacity is its rising posture's: a low centre
     of mass on a base that is still forming. This is the owner's physical answer to stun-lock, and it
     replaces 02's interim rule, where a rising body used the standing threshold. Add no immunity
     and no escape on top of it.
   - **Stagger is physical as well.** Take it as the impulse whose centre-of-mass excursion the base
     can still absorb without tipping, where a stated physical reading allows that. If none does,
     keep a stated fraction of the fall capacity as a recorded fallback.
2. **One knockdown table for every body.** Settle, rest, lying cap and rise peak, with the rise peak
   and times scaled by size and recovery as today.
   - Stone, human, wheel and multileg get the settle rule they lack. Today they rise after the dwell
     whether or not the fall has stopped.
3. **One posture predicate** for every body.
4. **Delete the per-family brace and gait numbers**, and the `Knockdown` table's per-body rows.
5. **The knockdown rate is not held.** The owner's rule is that knockdown is physical unless the
   physical way fails. So the x1 rate is whatever tipping capacity and momentum transfer give, and it
   is reported beside 01's and 06's. The physical way **fails** only in these cases:
   - the solver and the formula disagree past the stated tolerance, and no fix to the model closes it;
   - an x1 mirror never falls;
   - an x1 mirror falls on most scored blows;
   - a cell of the idle-dummy matrix falls to zero wins.

   Only then may a special rule come back. It is the narrowest that fixes the failure, it is recorded
   under "Chosen on the owner's behalf" with the failure beside it, and it can be reversed.

## Measure

- **The shove bench:** the stagger and fall impulses per family against the tipping prediction. The
  solver and the formula agree within a stated tolerance.
- **Knockdowns a bout** per family against 01's and 06's. Reported, not gated.
- **The stun-lock figures from 02**, reported.
- **The idle-dummy matrix from 01.**
- **x1 against x1 either side**, with the fingerprint diff.
- **The stability sweep** (`--stat stability`, 192 blocks). The row still moves the fall impulse.
