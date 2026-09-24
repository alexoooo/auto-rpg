# Physical contact 06: knockback from momentum transfer

## Why

A scored blow shoves by one of two authored rules, and neither is physics:

- `speed * 0.11 * (1.35 - 0.7 * quality)` N.s (`resolve` in `src/combat.ts`), which carries no mass
  at all;
- or a declared `authoredSpecificImpulseMps`.

The stability model divides that shove by the victim's supported mass and keeps only its horizontal
part. A parry, blade on blade, shoves nothing through that path.

## Changes

1. **One rule for every contact.** The struck body's velocity change is the impulse of an inelastic
   contact between the striker's effective mass and the struck body:
   - `J = (1 + e) * m_a * m_b / (m_a + m_b) * v_n` along the contact normal, where m_a and m_b are
     the striker's and the struck point's effective masses from session 05's function (each walked
     to its own floating base, so neither exceeds its whole body);
   - the struck body's centre of mass takes `dv = J / M`, with M its whole supported mass while it
     stands. Once it is a ragdoll the solver's own contact carries the transfer, and nothing is
     added;
   - e is the restitution 01 measured, one constant.
2. **The stability input is 3D.** The accumulator in `stepSupportedLocomotionState` takes the
   specific impulse `J / M`:
   - horizontal as now;
   - the vertical component kept for session 07, which turns sustained upward force into a lift.
3. **Delete both authored rules**, `authoredSpecificImpulseMps` and the `speed * 0.11` formula. The
   `Striking` field and its tests go with them. Rewrite `specific_impulse_bash_is_mass_independent`,
   because a bash is now mass-dependent by design, and pin that instead.
4. **Parries push.** Contact between an item and an item, or an item and a shield, runs the same
   transfer into the owner's body. The parrying body can then be driven back or staggered by a
   heavier blow.
5. **Carried mass for every body.**
   - The wheel and multileg divide by their own mass only, fixed at build.
   - Give them `carry()` as the biped has, so every body divides by what it actually weighs.
6. **Retune the thresholds, as a holding repair.** Retune `STAGGER_SPECIFIC_IMPULSE_MPS` and
   `FALL_SPECIFIC_IMPULSE_MPS` so the x1 knockdown rate stays at 01's value. Session 08 deletes
   both in favour of tipping capacity, and the owner's rule is that knockdown ends up physical, so
   state this retune as temporary in the constants' doc comments.

## Measure

- **The shove bench** (`BENCH_SHOVE` and `shovedAt`), re-read with the new input.
- **Knockdowns a bout** for stone, skeleton and human mirrors against 01.
- **The giant preset against x1.** The giant now knocks the x1 down more often than the reverse.
- **x1 against x1 either side**, with the fingerprint diff.
- **The stun-lock figures from 02**, reported: parries now push, and a rising body can be driven
  back down.
- **The idle-dummy matrix from 01.**
