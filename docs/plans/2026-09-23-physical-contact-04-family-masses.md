# Physical contact 04: bodies heavy enough

## Why

**Two equal x1 bodies must not be able to lift each other.**

Today a x1 stone golem weighs 90.6 kg, which is 889 N. That is measured in the headless arena by
summing every body's `getMassProperties`. Its shoulder is rated at 1200 Nm (`CHAIN_REACH`), which is
roughly 1,670 N at the hand. So one arm can lift nearly twice its own body.

The owner's rule is that masses are physically based per family:

- **Stone is heavy enough**: heavy enough that an x1 arm cannot lift an x1 body, and the weight
  attribute does the rest. It is not raised to stone density. Today every stone mass is at
  `SHIPPED_MASS_SCALE` 0.162 of 2600 kg/m3.
- **The human stays at human scale.**
- **The skeleton is lighter than the human.**

**What decides a lift is a ratio, not a density.** An arm can lift what its torque has left over
after holding up its own links. Under the rule "size a force off the arm" its torque scales with its
own mass, so raising every part by one factor raises the lifting force and the weight together, and
leaves the ratio where it is. The lever is the mass of the **body** (trunk, pelvis, legs and head)
against the arm's spare torque. So the body takes the mass and the arm links stay light **by
design**, not as an exception.

## Changes

1. **Stone.**
   - Give the trunk, pelvis, legs and head one body density for the family, in place of `kg()` on
     those parts' derivations. It is one stated number, not a per-part tune.
   - Choose it as the lightest density at which **both** arms of an x1 stone body, at their full
     spare torque on 01's lift bench, fall short of an x1 stone body's weight by a stated margin
     (1.25 to start). Write the derivation and its table into the constant's doc comment.
   - The arm links keep `kg()` and their motor ceilings. Record in `config.ts` why: an arm heavier
     by a factor needs a torque stronger by that factor, which gives the lift back.
   - Record the density under "Chosen on the owner's behalf", as the value the owner's "heavy
     enough" produced.
2. **The human.** Check every part against human anthropometry, and correct any part that is not at
   human scale. The arm's `MASSES` of 2.8, 2.0 and 1.1 kg already are.
3. **The skeleton.** Bone mass is a fraction of the human's, with a stated source for the fraction.
   It must be lighter than the human in every part. If its arms can then lift a skeleton, that is a
   finding about the skeleton's arm torque, reported against the lift bench; the skeleton is not
   made heavier to hide it.
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
  forward. The body density is chosen once, by the rule in change 1; it is not moved again to pass
  a second bench.

## Measure

- The mass census from 01, before and after.
- The lift bench.
- Every arm bench (`.review/size-bench.mjs arm` figures and `tests/golem-bench.test.mjs`).
- The knockdown bench.
- x1 against x1 either side for stone, skeleton and human, with the fingerprint diff.
- The idle-dummy matrix from 01. A heavier stone body must still be defeatable, idle, by every
  attacker.
- Update `golemUpperMassKg` and `carry` so that they agree with the new masses, and close the
  unloaded-mass gap documented in the size section if the new derivation allows.
