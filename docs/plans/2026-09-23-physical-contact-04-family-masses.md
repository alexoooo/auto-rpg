# Physical contact 04: physically based family masses

## Why

**Two equal x1 bodies must not be able to lift each other.**

Today a x1 stone golem weighs 90.6 kg, which is 889 N. That is measured in the headless arena by
summing every body's `getMassProperties`. Its shoulder is rated at 1200 Nm (`CHAIN_REACH`), which is
roughly 1,670 N at the hand. So one arm can lift nearly twice its own body.

The owner's rule is that masses are physically based per family:

- **Stone is heavy.** Today it is at `SHIPPED_MASS_SCALE` 0.162 of 2600 kg/m3.
- **The human stays at human scale.**
- **The skeleton is lighter than the human.**

## Changes

1. **Stone.**
   - Raise the trunk, pelvis, legs and head to stone density, taking `kg()` off those parts'
     derivations.
   - The arm links follow if the bench shows their motors still carry them:
     - stroke stray within the 50 mm the bench test refuses;
     - the lash, maul and pitch hinge arriving.
   - If they cannot, the arm links stay light as one stated exception, and the reason goes in
     `config.ts`. Record it under "Chosen on the owner's behalf".
2. **The human.** Check every part against human anthropometry, and correct any part that is not at
   human scale. The arm's `MASSES` of 2.8, 2.0 and 1.1 kg already are.
3. **The skeleton.** Bone mass is a fraction of the human's, with a stated source for the fraction.
   It must be lighter than the human in every part.
4. **Re-derive every force sized off a mass**, from the arm or body it moves, never from the scale.
   See "A uniform mass scale does not size a force" in `AGENTS.md`. `runGolemBench(...).massKg`
   prints the driven mass for this.
   - The locomotion carriers are keyframed, so their authority is unaffected.
   - The ragdoll, the knockdown and the rise are affected, and are re-read on the knockdown bench.
5. **Stability thresholds.** The stagger and fall thresholds divide by supported mass, so a heavier
   body is harder to stagger with the same shove.
   - Hold today's x1 knockdown rate from 01 by rescaling `STAGGER_SPECIFIC_IMPULSE_MPS` and
     `FALL_SPECIFIC_IMPULSE_MPS` to the new supported masses.
   - Sessions 06 and 08 replace both, so this is a holding repair, stated as one.

## Lift targets, on 01's lift bench

- An equal x1 body cannot be lifted by one or both arms of another, for stone, human and skeleton
  mirrors.
- The `max` preset giant lifts a x1 stone body with both arms. Its arm torque grows as s^4 while the
  x1 body's weight is fixed.
- If both cannot hold together, find which arm torque is out of proportion and bring the finding
  forward. Do not tune a mass to pass the bench.

## Measure

- The mass census from 01, before and after.
- The lift bench.
- Every arm bench (`.review/size-bench.mjs arm` figures and `tests/golem-bench.test.mjs`).
- The knockdown bench.
- x1 against x1 either side for stone, skeleton and human, with the fingerprint diff.
- Update `golemUpperMassKg` and `carry` so that they agree with the new masses, and close the
  unloaded-mass gap documented in the size section if the new derivation allows.
