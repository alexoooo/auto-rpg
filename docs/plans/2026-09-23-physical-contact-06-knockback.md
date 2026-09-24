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
   - `J = (1 + e) * m_eff * M / (m_eff + M) * v_n` along the contact normal;
   - `dv = J / M`;
   - M is the struck body's whole supported mass while it stands, and the part's mass once it is a
     ragdoll;
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
6. **Retune the thresholds.** Retune `STAGGER_SPECIFIC_IMPULSE_MPS` and `FALL_SPECIFIC_IMPULSE_MPS`
   so the x1 knockdown rate stays at 01's value.

## Measure

- **The shove bench** (`BENCH_SHOVE` and `shovedAt`), re-read with the new input.
- **Knockdowns a bout** for stone, skeleton and human mirrors against 01.
- **The giant preset against x1.** The giant now knocks the x1 down more often than the reverse.
- **x1 against x1 either side**, with the fingerprint diff.
