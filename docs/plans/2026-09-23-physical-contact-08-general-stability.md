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

## What landed, 2026-09-24

Every figure is in `docs/analysis/2026-09-23-attribute-measurements.md` "Physical contact 08:
stability from the body", with its harness. Three commits, 84e8251, 57bff3c and 567350a. What
differs from the plan above:

- **Tipping from the body, as planned.** A standing body is a rigid body rocking about its base's
  edge, `src/tipping.ts`; the formula agrees with the solver within 6 % on three blocks, and the
  shove bench's falls with the prediction to 0.3 %. A blow counts by its height over the centre of
  mass's.
- **A rising body is read on the stance it rises onto**, not on what of it touches the floor, which
  spans nothing under the centre of mass during a keyframed rise and put every rising body down at
  any touch.
- **The stagger line is the recorded fallback**: 0.43 of the fall line, the ratio the frozen lines
  had. No physical reading gives a rigid body on a rigid floor a stagger threshold of its own.
- **A base is the stance, lifted feet included**, and a body already past its base reads its reach
  along the push to the far edge rather than zero.
- **One knockdown table and one posture predicate for every body**; the brace, gait and per-body
  rows are gone.
- **The physical way seemed to fail and did not.** With every blow read at the centre of mass's
  height an x1 stone mirror all but never fell, and a blow gain of 7 came back as the narrowest rule.
  The height had been dropped by the locomotion port's copy of the event. With it restored the gain
  went: the stone mirror falls 0.56 [0.45, 0.68] times a body a bout, the skeleton on a third of the
  scored blows it takes standing, and no idle-matrix cell is newly at zero. None of item 5's
  conditions holds, and no special rule is in the tree.
- **The skeleton is down 64 % of a bout**, 16.5 knockdowns a body, because its centre of mass stands
  outside its feet a third of the time; the mace skeleton's fall impulse is 0 at rest. A stance under
  the centre of mass was measured (11.4 knockdowns) and left out for its walk-start foot slip, over
  budget. It is the owner's call, in session 10's list.
- **The stability stat now moves almost nothing** on the stone mirror: 0.65 to 0.51 knockdowns
  across x0.75 to x1.5, d = 0.17 at x1.5.
- Fixtures that moved: the research knockdown and sever fixtures, the contact press's walking test,
  the pair corpus's lie, the paired-lab test (onto the maul), and the thrust-booking test, whose
  director walked its point into the other body between thrusts.
